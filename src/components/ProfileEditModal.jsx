import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'
import { updateMe, checkNickname, changePassword } from '../services/authApi'
import { uploadImage } from '../services/uploadApi'
import { avatarOf } from '../utils/avatar'
import ConfirmModal from './ConfirmModal'
import PasswordInput from './PasswordInput'

const TAGLINE_MAX = 20
const NICKNAME_RE = /^[가-힣A-Za-z0-9]{2,8}$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,12}$/

export default function ProfileEditModal({ open, onSaved, onCancel }) {
  const { t } = useLanguage()
  const { user, updateUser } = useAuth()
  const showToast = useToast()
  const formatError = useApiError()
  const fileInputRef = useRef(null)

  const [avatarUrl, setAvatarUrl] = useState(null)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nickCheck, setNickCheck] = useState('idle') // 'idle'|'checking'|'available'|'taken'|'invalid'
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setAvatarUrl(user.avatarUrl || null)
    setName(user.name || '')
    setTagline(user.bio || '')
    setCurPw('')
    setNewPw('')
    setConfirmPw('')
    setNickCheck('idle')
    setPasswordOpen(false)
    function onKey(e) { if (e.key === 'Escape') handleCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user])

  // debounced nickname check
  useEffect(() => {
    if (!open) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === user.name) {
      setNickCheck('idle')
      return
    }
    if (!NICKNAME_RE.test(trimmed)) {
      setNickCheck('invalid')
      return
    }
    setNickCheck('checking')
    const tid = setTimeout(async () => {
      try {
        const { available, reason } = await checkNickname(trimmed)
        if (available) setNickCheck('available')
        else if (reason === 'blocked') setNickCheck('blocked')
        else setNickCheck('taken')
      } catch {
        setNickCheck('idle')
      }
    }, 400)
    return () => clearTimeout(tid)
  }, [name, open, user])

  if (!open || !user) return null

  const profileDirty =
    avatarUrl !== (user.avatarUrl || null) ||
    name.trim() !== user.name ||
    tagline !== (user.bio || '')
  const passwordDirty = curPw || newPw || confirmPw
  const dirty = profileDirty || passwordDirty

  const nameChanged = name.trim() !== user.name
  const nameBlocking = nameChanged && nickCheck !== 'available'

  const passwordsFilled = curPw && newPw && confirmPw
  const passwordsMatch = newPw === confirmPw
  const passwordValid = PASSWORD_RE.test(newPw)
  const passwordBlocking = passwordDirty && (!passwordsFilled || !passwordsMatch || !passwordValid)

  const canSave = dirty && !nameBlocking && !passwordBlocking && !saving && !uploading

  function handleCancel() {
    if (dirty) {
      setCloseConfirm(true)
    } else {
      onCancel()
    }
  }

  function confirmClose() {
    setCloseConfirm(false)
    onCancel()
  }

  function togglePassword() {
    if (passwordOpen) {
      setCurPw('')
      setNewPw('')
      setConfirmPw('')
    }
    setPasswordOpen(v => !v)
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setAvatarUrl(url)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      // 1) Profile fields
      if (profileDirty) {
        const patch = {}
        if (avatarUrl !== (user.avatarUrl || null)) patch.avatarUrl = avatarUrl
        if (nameChanged) patch.name = name.trim()
        if (tagline !== (user.bio || '')) patch.bio = tagline
        const { user: next } = await updateMe(patch)
        updateUser(next)
        onSaved?.(next)
      }
      // 2) Password (separate endpoint; only if all 3 filled)
      if (passwordsFilled) {
        await changePassword({ currentPassword: curPw, newPassword: newPw })
      }
      showToast(t('profile.editSaved'), 'success')
      onCancel()
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-card modal-card-wide">
          <h2 className="modal-title">{t('profile.edit')}</h2>

          <div className="modal-form">
            {/* Avatar */}
            <div className="profile-edit-avatar-row">
              <img src={avatarOf(avatarUrl)} alt="" className="profile-edit-avatar" />
              <div className="profile-edit-avatar-actions">
                <button
                  type="button"
                  className="profile-edit-avatar-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || saving}
                >
                  {uploading ? t('profile.uploading') : t('profile.uploadAvatar')}
                </button>
                <button
                  type="button"
                  className="profile-edit-avatar-btn profile-edit-avatar-btn-ghost"
                  onClick={() => setAvatarUrl(null)}
                  disabled={!avatarUrl || uploading || saving}
                >
                  {t('profile.resetAvatar')}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
              </div>
            </div>

            <div className="profile-edit-divider" />

            {/* Nickname */}
            <label className="modal-field">
              <span className="modal-field-label">{t('profile.nickname')}</span>
              <input
                type="text"
                className="modal-input"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={8}
                disabled={saving}
              />
              {nameChanged && (
                <span className={`profile-edit-nick-status profile-edit-nick-${nickCheck}`}>
                  {nickCheck === 'checking' && t('profile.nicknameChecking')}
                  {nickCheck === 'invalid' && t('profile.nicknameInvalid')}
                  {nickCheck === 'blocked' && t('profile.nicknameBlocked')}
                  {nickCheck === 'taken' && t('profile.nicknameTaken')}
                  {nickCheck === 'available' && t('profile.nicknameAvailable')}
                </span>
              )}
            </label>

            {/* Tagline */}
            <label className="modal-field">
              <span className="modal-field-label">
                {t('profile.tagline')}
                <span className="profile-edit-bio-count">{tagline.length}/{TAGLINE_MAX}</span>
              </span>
              <input
                type="text"
                className="modal-input"
                value={tagline}
                onChange={e => setTagline(e.target.value.slice(0, TAGLINE_MAX))}
                placeholder={t('profile.taglinePlaceholder')}
                maxLength={TAGLINE_MAX}
                disabled={saving}
              />
            </label>

            <div className="profile-edit-divider" />

            {/* Password (collapsed by default) */}
            <button
              type="button"
              className={`profile-edit-password-toggle ${passwordOpen ? 'is-open' : ''}`}
              onClick={togglePassword}
              disabled={saving}
            >
              {passwordOpen ? t('profile.passwordToggleClose') : t('profile.passwordToggleOpen')}
            </button>

            {passwordOpen && (
              <>
                <label className="modal-field">
                  <span className="modal-field-label">{t('profile.currentPassword')}</span>
                  <PasswordInput
                    className="modal-input"
                    value={curPw}
                    onChange={e => setCurPw(e.target.value)}
                    disabled={saving}
                    autoComplete="current-password"
                  />
                </label>
                <label className="modal-field">
                  <span className="modal-field-label">{t('profile.newPassword')}</span>
                  <PasswordInput
                    className="modal-input"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    disabled={saving}
                    autoComplete="new-password"
                  />
                  {newPw && !passwordValid && (
                    <span className="modal-field-warning">{t('profile.passwordInvalid')}</span>
                  )}
                </label>
                <label className="modal-field">
                  <span className="modal-field-label">{t('profile.confirmPassword')}</span>
                  <PasswordInput
                    className="modal-input"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    disabled={saving}
                    autoComplete="new-password"
                  />
                  {confirmPw && !passwordsMatch && (
                    <span className="modal-field-warning">{t('profile.passwordMismatch')}</span>
                  )}
                </label>
              </>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={handleCancel} disabled={saving}>
              {t('community.action.cancel')}
            </button>
            <button
              type="button"
              className="profile-edit-save-btn"
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving ? t('profile.saving') : t('community.action.confirm')}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={closeConfirm}
        message={t('profile.unsavedChanges')}
        variant="danger"
        onConfirm={confirmClose}
        onCancel={() => setCloseConfirm(false)}
      />
    </>
  )
}

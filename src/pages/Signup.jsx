import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useApiError } from '../hooks/useApiError'
import * as authApi from '../services/authApi'
import PasswordInput from '../components/PasswordInput'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,12}$/
const NICKNAME_RE = /^[\uAC00-\uD7A3A-Za-z0-9]{2,8}$/

export default function Signup() {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [nickCheck, setNickCheck] = useState('idle') // idle | checking | available | taken
  const [checkedNick, setCheckedNick] = useState('')
  const [email, setEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const trimmedNick = nickname.trim()
  const nickValid = NICKNAME_RE.test(trimmedNick)
  const nickInvalid = nickname.length > 0 && !nickValid
  const nickConfirmed = nickValid && nickCheck === 'available' && checkedNick === trimmedNick
  const emailInvalid = email.length > 0 && !EMAIL_RE.test(email)
  const pwInvalid = password.length > 0 && !PASSWORD_RE.test(password)
  const pwMismatch = passwordConfirm.length > 0 && password !== passwordConfirm
  const emailValid = EMAIL_RE.test(email)

  function handleNicknameChange(value) {
    setNickname(value)
    if (nickCheck !== 'idle') setNickCheck('idle')
  }

  async function handleCheckNickname() {
    if (!nickValid || nickCheck === 'checking') return
    setNickCheck('checking')
    try {
      const { available, reason } = await authApi.checkNickname(trimmedNick)
      setCheckedNick(trimmedNick)
      if (available) setNickCheck('available')
      else if (reason === 'blocked') setNickCheck('blocked')
      else setNickCheck('taken')
    } catch (err) {
      setNickCheck('idle')
      showToast(formatError(err), 'error')
    }
  }

  async function handleSendCode() {
    if (!emailValid || sending) return
    setSending(true)
    try {
      const resp = await authApi.sendCode(email)
      setCodeSent(true)
      const msg = resp.devCode
        ? `${t('signup.codeSent')} (dev: ${resp.devCode})`
        : t('signup.codeSent')
      showToast(msg, 'success')
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    if (!agreeTerms || !agreePrivacy) {
      showToast(t('signup.agreeAllRequired'), 'error')
      return
    }
    if (!nickConfirmed || !emailValid || !PASSWORD_RE.test(password) || password !== passwordConfirm || !codeSent || !code) return
    setSubmitting(true)
    try {
      await signup({ email, code, password, name: trimmedNick })
      showToast(t('signup.success'), 'success')
      navigate('/')
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{t('signup.title')}</h1>

        <label className="auth-field">
          <span className="auth-label">{t('signup.nickname')}</span>
          <div className="auth-inline">
            <input
              type="text"
              className={`auth-input ${nickInvalid || nickCheck === 'taken' || nickCheck === 'blocked' ? 'auth-input-error' : ''}`}
              placeholder={t('signup.nicknamePlaceholder')}
              value={nickname}
              onChange={e => handleNicknameChange(e.target.value)}
              maxLength={8}
              autoComplete="nickname"
            />
            <button
              type="button"
              className="auth-inline-btn"
              onClick={handleCheckNickname}
              disabled={!nickValid || nickCheck === 'checking' || nickConfirmed}
            >
              {nickCheck === 'checking' ? t('signup.nicknameChecking') : t('signup.nicknameCheck')}
            </button>
          </div>
          {nickInvalid ? (
            <span className="auth-error">{t('signup.nicknameInvalid')}</span>
          ) : nickCheck === 'available' && nickConfirmed ? (
            <span className="auth-hint auth-ok">{t('signup.nicknameAvailable')}</span>
          ) : nickCheck === 'blocked' ? (
            <span className="auth-error">{t('signup.nicknameBlocked')}</span>
          ) : nickCheck === 'taken' ? (
            <span className="auth-error">{t('signup.nicknameTaken')}</span>
          ) : (
            <span className="auth-hint">{t('signup.nicknameHint')}</span>
          )}
        </label>

        <label className="auth-field">
          <span className="auth-label">{t('signup.email')}</span>
          <div className="auth-inline">
            <input
              type="email"
              className={`auth-input ${emailInvalid ? 'auth-input-error' : ''}`}
              placeholder={t('signup.emailPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              type="button"
              className="auth-inline-btn"
              onClick={handleSendCode}
              disabled={!emailValid || sending}
            >
              {sending ? t('signup.sending') : codeSent ? t('signup.resendCode') : t('signup.sendCode')}
            </button>
          </div>
          {emailInvalid && (
            <span className="auth-error">{t('signup.emailInvalid')}</span>
          )}
        </label>

        {codeSent && (
          <label className="auth-field">
            <span className="auth-label">{t('signup.code')}</span>
            <input
              type="text"
              className="auth-input"
              placeholder={t('signup.codePlaceholder')}
              value={code}
              onChange={e => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
        )}

        <label className="auth-field">
          <span className="auth-label">{t('signup.password')}</span>
          <PasswordInput
            className={`auth-input ${pwInvalid ? 'auth-input-error' : ''}`}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className={`auth-hint ${pwInvalid ? 'auth-error' : ''}`}>
            {t('signup.pwHint')}
          </span>
        </label>

        <label className="auth-field">
          <span className="auth-label">{t('signup.passwordConfirm')}</span>
          <PasswordInput
            className={`auth-input ${pwMismatch ? 'auth-input-error' : ''}`}
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {pwMismatch && (
            <span className="auth-error">{t('signup.pwMismatch')}</span>
          )}
        </label>

        <div className="auth-agree">
          <label className="auth-agree-item">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={e => setAgreeTerms(e.target.checked)}
            />
            <span>
              <strong className="auth-agree-required">{t('signup.agreeRequired')}</strong>{' '}
              {t('signup.agreeTerms')}
            </span>
            <Link to="/terms" target="_blank" rel="noopener noreferrer" className="auth-agree-view">
              {t('signup.agreeView')}
            </Link>
          </label>
          <label className="auth-agree-item">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={e => setAgreePrivacy(e.target.checked)}
            />
            <span>
              <strong className="auth-agree-required">{t('signup.agreeRequired')}</strong>{' '}
              {t('signup.agreePrivacy')}
            </span>
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="auth-agree-view">
              {t('signup.agreeView')}
            </Link>
          </label>
        </div>

        <button
          type="submit"
          className="auth-submit"
          disabled={submitting || !agreeTerms || !agreePrivacy}
        >
          {submitting ? t('signup.submitting') : t('signup.submit')}
        </button>
      </form>
    </main>
  )
}

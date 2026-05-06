import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useApiError, isAuthError, isSuspendedError } from '../../hooks/useApiError'
import { uploadImage } from '../../services/uploadApi'

const REASON_KEYS = ['spam', 'abuse', 'adult', 'privacy', 'fake', 'inappropriate', 'other']
const MAX_REASONS = 2
const MAX_IMAGES = 2
const DETAILS_MAX = 500

export default function ReportModal({ open, onConfirm, onCancel }) {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()
  const fileInputRef = useRef(null)
  const [reasons, setReasons] = useState([])
  const [details, setDetails] = useState('')
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setReasons([])
    setDetails('')
    setImages([])
    setUploading(false)
    setSubmitting(false)
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const detailsRequired = reasons.length === 1 && reasons[0] === 'other'
  const canSubmit =
    reasons.length > 0 &&
    !submitting &&
    !uploading &&
    (!detailsRequired || details.trim().length > 0)

  function toggleReason(key) {
    setReasons(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= MAX_REASONS) return prev
      return [...prev, key]
    })
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) return
    const picks = files.slice(0, remaining)
    setUploading(true)
    try {
      const urls = []
      for (const f of picks) {
        const url = await uploadImage(f)
        urls.push(url)
      }
      setImages(prev => [...prev, ...urls])
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  function removeImage(idx) {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    const labels = reasons.map(k => t(`community.report.reasons.${k}`))
    const trimmed = details.trim()
    // Human-readable summary stored in reports.reason (backward compat + admin display).
    const isOnlyOther = reasons.length === 1 && reasons[0] === 'other'
    const reason = isOnlyOther
      ? trimmed
      : (trimmed ? `[${labels.join(' / ')}] ${trimmed}` : `[${labels.join(' / ')}]`)
    setSubmitting(true)
    try {
      await onConfirm({
        reason,
        reasonCodes: [...reasons],
        imageUrls: [...images],
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{t('community.report.title')}</h2>
        <div className="modal-form">
          <div className="modal-field">
            <span className="modal-field-label">
              {t('community.report.selectReason')}
              <span className="report-details-hint">({reasons.length}/{MAX_REASONS})</span>
            </span>
            <div className="report-reason-list">
              {REASON_KEYS.map(key => {
                const active = reasons.includes(key)
                const disabled = !active && reasons.length >= MAX_REASONS
                return (
                  <button
                    key={key}
                    type="button"
                    className={`report-reason-chip ${active ? 'active' : ''}`}
                    onClick={() => toggleReason(key)}
                    disabled={submitting || disabled}
                  >
                    {t(`community.report.reasons.${key}`)}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="modal-field">
            <span className="modal-field-label">
              {t('community.report.detailsLabel')}
              <span className="report-details-hint">
                ({detailsRequired ? t('community.report.detailsRequired') : t('community.report.detailsOptional')})
              </span>
            </span>
            <textarea
              className="modal-input modal-textarea"
              value={details}
              onChange={e => setDetails(e.target.value.slice(0, DETAILS_MAX))}
              placeholder={t('community.report.detailsPlaceholder')}
              rows={3}
              disabled={submitting}
              maxLength={DETAILS_MAX}
            />
          </label>

          <div className="modal-field">
            <span className="modal-field-label">
              {t('community.report.imagesLabel')}
              <span className="report-details-hint">({images.length}/{MAX_IMAGES})</span>
            </span>
            <div className="report-image-list">
              {images.map((url, i) => (
                <div key={url + i} className="report-image-thumb">
                  <img src={url} alt="" />
                  <button
                    type="button"
                    className="report-image-remove"
                    onClick={() => removeImage(i)}
                    disabled={submitting}
                    aria-label="remove"
                  >×</button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  className="report-image-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || submitting}
                >
                  {uploading ? t('profile.uploading') : '+'}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFileChange}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
            {t('community.action.cancel')}
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {t('community.report.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

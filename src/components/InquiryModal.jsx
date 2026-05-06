import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'
import { uploadImage } from '../services/uploadApi'

const MESSAGE_MAX = 1000
const MAX_IMAGES = 2

export default function InquiryModal({ open, title, subtitle, onConfirm, onCancel }) {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()
  const fileInputRef = useRef(null)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setMessage('')
    setImages([])
    setUploading(false)
    setSubmitting(false)
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const canSubmit = message.trim().length > 0 && !submitting && !uploading

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
    setSubmitting(true)
    try {
      await onConfirm({ message: message.trim(), imageUrls: [...images] })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        {subtitle && <p className="modal-body">{subtitle}</p>}
        <div className="modal-form">
          <label className="modal-field">
            <span className="modal-field-label">
              {t('inquiry.messageLabel')}
              <span className="report-details-hint">{message.length}/{MESSAGE_MAX}</span>
            </span>
            <textarea
              className="modal-input modal-textarea"
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder={t('inquiry.messagePlaceholder')}
              rows={5}
              disabled={submitting}
              maxLength={MESSAGE_MAX}
            />
          </label>

          <div className="modal-field">
            <span className="modal-field-label">
              {t('inquiry.imagesLabel')}
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
            className="modal-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {t('inquiry.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

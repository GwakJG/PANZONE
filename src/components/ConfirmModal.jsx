import { useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  const { t } = useLanguage()

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        {title && <h2 className="modal-title">{title}</h2>}
        {message && <p className="modal-body">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            {cancelLabel || t('community.action.cancel')}
          </button>
          <button
            type="button"
            className={variant === 'danger' ? 'modal-btn-danger' : 'modal-btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel || t('community.action.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

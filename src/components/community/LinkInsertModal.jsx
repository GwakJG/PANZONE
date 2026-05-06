import { useEffect, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'

export default function LinkInsertModal({ open, withText = true, onConfirm, onCancel }) {
  const { t } = useLanguage()
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setUrl('https://')
    setText('')
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const canSubmit = url.trim() && url.trim() !== 'https://'

  function submit() {
    if (!canSubmit) return
    const result = { url: url.trim() }
    if (withText) result.text = text.trim() || url.trim()
    onConfirm(result)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{t('community.write.tool.link')}</h2>
        <div className="modal-form">
          <label className="modal-field">
            <span className="modal-field-label">{t('community.write.linkPrompt')}</span>
            <input
              type="url"
              className="modal-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
            />
          </label>
          {withText && (
            <label className="modal-field">
              <span className="modal-field-label">{t('community.write.linkTextPrompt')}</span>
              <input
                type="text"
                className="modal-input"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
              />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            {t('community.action.cancel')}
          </button>
          <button type="button" className="modal-btn-primary" onClick={submit} disabled={!canSubmit}>
            {t('community.action.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

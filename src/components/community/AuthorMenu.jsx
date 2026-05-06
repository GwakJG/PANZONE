import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'

export default function AuthorMenu({ canEdit, onEdit, onDelete, onShare }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Nothing to show → render nothing.
  if (!onShare && !canEdit && !onDelete) return null

  return (
    <div className="author-menu" ref={rootRef}>
      <button
        type="button"
        className="author-menu-btn"
        onClick={() => setOpen(v => !v)}
        aria-label="menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="author-menu-dropdown">
          {onShare && (
            <button type="button" className="author-menu-item" onClick={() => { setOpen(false); onShare() }}>
              {t('community.action.share')}
            </button>
          )}
          {canEdit && (
            <button type="button" className="author-menu-item" onClick={() => { setOpen(false); onEdit?.() }}>
              {t('community.action.edit')}
            </button>
          )}
          {onDelete && (
            <button type="button" className="author-menu-item danger" onClick={() => { setOpen(false); onDelete() }}>
              {t('community.action.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

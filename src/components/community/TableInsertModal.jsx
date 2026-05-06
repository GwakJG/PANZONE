import { useEffect, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'

const MAX_ROWS = 20
const MAX_COLS = 10

export default function TableInsertModal({ open, onConfirm, onCancel }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  useEffect(() => {
    if (!open) return
    setRows(3)
    setCols(3)
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  function clamp(v, min, max) {
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return min
    return Math.max(min, Math.min(max, n))
  }

  function submit() {
    const r = clamp(rows, 1, MAX_ROWS)
    const c = clamp(cols, 1, MAX_COLS)
    onConfirm({ rows: r, cols: c })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{t('community.write.tool.table')}</h2>
        <div className="modal-form">
          <div className="modal-field-row">
            <label className="modal-field">
              <span className="modal-field-label">{t('community.write.tableRows')}</span>
              <input
                type="number"
                className="modal-input"
                min="1"
                max={MAX_ROWS}
                value={rows}
                onChange={e => setRows(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
              />
              {parseInt(rows, 10) > MAX_ROWS && (
                <span className="modal-field-warning">{t('community.write.tableMaxRows', MAX_ROWS)}</span>
              )}
            </label>
            <label className="modal-field">
              <span className="modal-field-label">{t('community.write.tableCols')}</span>
              <input
                type="number"
                className="modal-input"
                min="1"
                max={MAX_COLS}
                value={cols}
                onChange={e => setCols(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
              />
              {parseInt(cols, 10) > MAX_COLS && (
                <span className="modal-field-warning">{t('community.write.tableMaxCols', MAX_COLS)}</span>
              )}
            </label>
          </div>
          <TablePreview rows={clamp(rows, 1, MAX_ROWS)} cols={clamp(cols, 1, MAX_COLS)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            {t('community.action.cancel')}
          </button>
          <button type="button" className="modal-btn-primary" onClick={submit}>
            {t('community.action.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function TablePreview({ rows, cols }) {
  return (
    <div className="modal-table-preview" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div key={i} className="modal-table-preview-cell" />
      ))}
    </div>
  )
}

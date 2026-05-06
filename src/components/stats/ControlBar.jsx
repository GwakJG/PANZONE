import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../../context/LanguageContext'

function seasonLabel(id) {
  const num = id.split('-').pop()
  return `Season ${num}`
}

export default function ControlBar({ perspective, onPerspectiveChange, season, onSeasonChange, seasons }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = seasons.find(s => s.id === season)

  return (
    <div className="control-bar">
      <div className="control-bar-left">
        <div className="perspective-toggle">
          <button
            className={`perspective-btn ${perspective === 'tpp' ? 'active' : ''}`}
            onClick={() => onPerspectiveChange('tpp')}
          >
            {t('stats.perspective.tpp')}
          </button>
          <button
            className={`perspective-btn ${perspective === 'fpp' ? 'active' : ''}`}
            onClick={() => onPerspectiveChange('fpp')}
          >
            {t('stats.perspective.fpp')}
          </button>
        </div>
      </div>
      <div className="control-bar-right">
        <div className="season-select-custom" ref={ref}>
          <button
            className={`season-select-trigger ${open ? 'open' : ''}`}
            onClick={() => setOpen(prev => !prev)}
          >
            <span className="season-select-label">
              {current ? seasonLabel(current.id) : ''}
            </span>
            <svg className={`season-select-arrow ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,4 6,8 10,4" />
            </svg>
          </button>
          {open && (
            <div className="season-select-dropdown">
              {seasons.map(s => (
                <button
                  key={s.id}
                  className={`season-select-option ${s.id === season ? 'active' : ''}`}
                  onClick={() => { onSeasonChange(s.id); setOpen(false) }}
                >
                  {seasonLabel(s.id)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

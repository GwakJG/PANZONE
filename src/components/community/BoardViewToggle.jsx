import { useLanguage } from '../../context/LanguageContext'

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function IconCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export default function BoardViewToggle({ view, onChange }) {
  const { t } = useLanguage()

  return (
    <div className="board-view-toggle">
      <button
        type="button"
        className={`board-view-tab ${view === 'list' ? 'active' : ''}`}
        onClick={() => onChange('list')}
        aria-label={t('community.view.list')}
        title={t('community.view.list')}
      >
        <IconList />
      </button>
      <button
        type="button"
        className={`board-view-tab ${view === 'card' ? 'active' : ''}`}
        onClick={() => onChange('card')}
        aria-label={t('community.view.card')}
        title={t('community.view.card')}
      >
        <IconCard />
      </button>
    </div>
  )
}

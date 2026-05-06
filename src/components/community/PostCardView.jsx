import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'

function formatDate(iso) {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

export default function PostCardView({ posts, boardId }) {
  const { t } = useLanguage()
  return (
    <div className="board-card-grid">
      {posts.map(p => (
        <Link key={p.id} to={`/community/${boardId}/${p.id}`} className={`board-card ${p.pinned ? 'board-card-pinned' : ''}`}>
          <div className="board-card-thumb">
            {p.thumbnail ? (
              <img src={p.thumbnail} alt="" />
            ) : (
              <div className="board-card-thumb-placeholder" />
            )}
          </div>
          <div className="board-card-body">
            <span className={`post-type board-card-notice-badge ${p.pinned ? 'post-type-notice' : ''}`}>
              {p.pinned ? t('community.type.notice') : t('community.type.normal')}
            </span>
            <h3 className="board-card-title">{p.title}</h3>
            <div className="board-card-author">{p.author}</div>
            <div className="board-card-meta">
              <span className="board-card-date">{formatDate(p.date)}</span>
              <span className="board-card-views">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {p.views.toLocaleString()}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

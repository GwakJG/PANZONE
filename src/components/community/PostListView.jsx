import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import Highlight from '../../utils/highlight.jsx'
import UserTierBadge from '../UserTierBadge'

function formatDate(iso) {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

function SortIndicator({ columnKey, sort }) {
  const activeDir = sort && sort.key === columnKey ? sort.order : null
  return (
    <span className="col-sort" aria-hidden="true">
      <span className={`col-sort-arrow up ${activeDir === 'asc' ? 'active' : ''}`}>▲</span>
      <span className={`col-sort-arrow down ${activeDir === 'desc' ? 'active' : ''}`}>▼</span>
    </span>
  )
}

function SortableHeader({ columnKey, label, sort, className }) {
  if (!sort) {
    return <th className={className}>{label}</th>
  }
  function handleClick() {
    if (sort.key !== columnKey) {
      sort.onChange(columnKey, 'asc')
    } else if (sort.order === 'asc') {
      sort.onChange(columnKey, 'desc')
    } else {
      sort.onChange(null, null)
    }
  }
  const isActive = sort.key === columnKey
  return (
    <th
      className={`${className} col-sortable ${isActive ? 'active' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
    >
      <span className="col-label">{label}</span>
      <SortIndicator columnKey={columnKey} sort={sort} />
    </th>
  )
}

export default function PostListView({ posts, boardId, showBoard = false, highlightQuery = '', sort = null }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const showBoardCol = showBoard

  function resolveBoard(p) {
    return p.boardSlug || boardId
  }

  function handleRowClick(e, post) {
    if (e.target.closest('a') || e.target.closest('button')) return
    navigate(`/community/${resolveBoard(post)}/${post.id}`)
  }

  return (
    <table className="board-list-table">
      <thead>
        <tr>
          {showBoardCol && <th className="col-board">{t('community.col.board')}</th>}
          <th className="col-type">{t('community.col.type')}</th>
          <th className="col-title">{t('community.col.title')}</th>
          <th className="col-author">{t('community.col.author')}</th>
          <SortableHeader columnKey="date" label={t('community.col.date')} sort={sort} className="col-date" />
          <SortableHeader columnKey="views" label={t('community.col.views')} sort={sort} className="col-views" />
          <SortableHeader columnKey="comments" label={t('community.col.comments')} sort={sort} className="col-comments" />
          <SortableHeader columnKey="likes" label={t('community.col.likes')} sort={sort} className="col-likes" />
        </tr>
      </thead>
      <tbody>
        {posts.map(p => (
          <tr
            key={p.id}
            className={`row-clickable ${p.pinned ? 'row-pinned' : ''}`}
            onClick={(e) => handleRowClick(e, p)}
          >
            {showBoardCol && (
              <td className="col-board">{t(`community.boardShort.${p.boardSlug}`)}</td>
            )}
            <td className="col-type">
              <span className={`post-type ${p.pinned ? 'post-type-notice' : ''}`}>
                {p.pinned ? t('community.type.notice') : t('community.type.normal')}
              </span>
            </td>
            <td className="col-title">
              <Link to={`/community/${resolveBoard(p)}/${p.id}`} className="post-title-link">
                {highlightQuery ? <Highlight text={p.title} query={highlightQuery} /> : p.title}
              </Link>
            </td>
            <td className="col-author">
              <UserTierBadge tier={p.authorTier} />
              {p.author}
            </td>
            <td className="col-date">{formatDate(p.date)}</td>
            <td className="col-views">{p.views.toLocaleString()}</td>
            <td className="col-comments">{p.commentCount}</td>
            <td className="col-likes">{p.likeCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

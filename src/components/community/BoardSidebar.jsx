import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { SIDEBAR_SECTIONS } from './boards'

export default function BoardSidebar({ currentBoard }) {
  const { t } = useLanguage()
  const location = useLocation()

  function isActive(item) {
    if (item.kind === 'board') return currentBoard === item.id
    if (item.id === 'home') return location.pathname === '/'
    if (item.id === 'hot') return location.pathname === '/community/hot'
    return false
  }

  function labelFor(item) {
    if (item.kind === 'board') return t(`community.boardShort.${item.id}`)
    return t(`community.sidebar.${item.id}`)
  }

  function pathFor(item) {
    return item.kind === 'board' ? `/community/${item.id}` : item.path
  }

  return (
    <aside className="board-sidebar">
      {SIDEBAR_SECTIONS.map((section, idx) => (
        <div key={idx} className="board-sidebar-group">
          {idx > 0 && <hr className="board-sidebar-divider" />}
          <ul className="board-sidebar-list">
            {section.map(item => (
              <li key={item.id}>
                <Link
                  to={pathFor(item)}
                  className={`board-sidebar-item ${isActive(item) ? 'active' : ''}`}
                >
                  {labelFor(item)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  )
}

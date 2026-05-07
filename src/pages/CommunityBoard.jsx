import { useEffect, useState } from 'react'
import { useParams, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth, useRequireLogin } from '../context/AuthContext'
import BoardSidebar from '../components/community/BoardSidebar'
import BoardViewToggle from '../components/community/BoardViewToggle'
import PostListView from '../components/community/PostListView'
import PostCardView from '../components/community/PostCardView'
import BoardPagination from '../components/community/BoardPagination'
import {
  isValidBoard,
  canWrite,
  DEFAULT_BOARD,
  hasTabs,
  isValidTab,
  BOARD_TABS,
} from '../components/community/boards'
import { fetchPosts } from '../services/postApi'

const PAGE_SIZE = 20

// 자동 동기화되는 보드만 헤더에 "~에 업데이트 됩니다" 노출.
const AUTO_SYNC_BOARDS = new Set(['patch', 'event', 'loot'])

export default function CommunityBoard() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem('pubgop_board_view')
      return saved === 'card' || saved === 'list' ? saved : 'list'
    } catch {
      return 'list'
    }
  })

  function handleViewChange(next) {
    setView(next)
    try { localStorage.setItem('pubgop_board_view', next) } catch { /* storage disabled — no-op */ }
  }

  // Page lives in the URL (?page=N) so back/forward navigation restores it.
  const [searchParams, setSearchParams] = useSearchParams()
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1

  const tabsForBoard = hasTabs(boardId) ? BOARD_TABS[boardId] : null
  const rawTab = searchParams.get('tab') || 'all'
  const activeTab = (rawTab === 'all' || isValidTab(boardId, rawTab)) ? rawTab : 'all'

  function setPage(next) {
    setSearchParams(prev => {
      const out = new URLSearchParams(prev)
      if (next <= 1) out.delete('page')
      else out.set('page', String(next))
      return out
    })
  }

  function setTab(nextTab) {
    setSearchParams(prev => {
      const out = new URLSearchParams(prev)
      if (nextTab === 'all') out.delete('tab')
      else out.set('tab', nextTab)
      // Reset page when switching tabs.
      out.delete('page')
      return out
    })
  }

  const [posts, setPosts] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function handleWriteClick() {
    if (!user) {
      requireLogin()
      return
    }
    navigate(`/community/${boardId}/write`)
  }

  useEffect(() => {
    if (!isValidBoard(boardId)) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const subcategory = (tabsForBoard && activeTab !== 'all') ? activeTab : undefined
    fetchPosts({ board: boardId, page, pageSize: PAGE_SIZE, subcategory })
      .then(data => {
        if (cancelled) return
        setPosts(data.posts)
        setTotalPages(data.totalPages)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [boardId, page, activeTab, tabsForBoard])

  if (!isValidBoard(boardId)) {
    return <Navigate to={`/community/${DEFAULT_BOARD}`} replace />
  }

  return (
    <div className="community-board">
      <BoardSidebar currentBoard={boardId} />

      <main className="board-main">
        <header className="board-header">
          <div className="board-title-group">
            <h1 className="board-title">{t(`community.board.${boardId}`)}</h1>
            {AUTO_SYNC_BOARDS.has(boardId) && (
              <span className="board-update-notice">
                {t(`community.updateSchedule.${boardId}`)}
              </span>
            )}
          </div>
          <BoardViewToggle view={view} onChange={handleViewChange} />
        </header>

        {tabsForBoard && (
          <div className="hot-period-tabs">
            <button
              type="button"
              className={`hot-period-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setTab('all')}
            >
              {t('community.boardTabs.all')}
            </button>
            {tabsForBoard.map(key => (
              <button
                key={key}
                type="button"
                className={`hot-period-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
              >
                {t(`community.boardTabs.${boardId}.${key}`)}
              </button>
            ))}
          </div>
        )}

        <div className="board-content">
          {loading ? (
            <div className="board-placeholder">{t('common.loading')}</div>
          ) : error ? (
            <div className="board-placeholder">{t('common.loadError')}</div>
          ) : posts.length === 0 ? (
            <div className="board-placeholder">{t('common.empty')}</div>
          ) : view === 'list'
            ? <PostListView posts={posts} boardId={boardId} />
            : <PostCardView posts={posts} boardId={boardId} />}
        </div>

        <div className="board-footer">
          <div className="board-footer-spacer" />
          <BoardPagination
            currentPage={page}
            totalPages={totalPages}
            onChange={setPage}
          />
          <div className="board-footer-actions">
            {canWrite(boardId) && (
              <button type="button" className="board-write-btn" onClick={handleWriteClick}>
                {t('community.writeButton')}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

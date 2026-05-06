import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import BoardSidebar from '../components/community/BoardSidebar'
import PostListView from '../components/community/PostListView'
import { fetchHotPosts } from '../services/postApi'

const REFRESH_MS = 30 * 60 * 1000

export default function HotBoard() {
  const { t } = useLanguage()
  const [period, setPeriod] = useState('today')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (p, showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await fetchHotPosts({ period: p })
      setPosts(data.posts)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period, true)
    const id = setInterval(() => load(period, false), REFRESH_MS)
    return () => clearInterval(id)
  }, [period, load])

  return (
    <div className="community-board">
      <BoardSidebar />

      <main className="board-main">
        <header className="board-header">
          <h1 className="board-title">{t('community.sidebar.hot')}</h1>
        </header>

        <div className="hot-period-tabs">
          <button
            type="button"
            className={`hot-period-tab ${period === 'today' ? 'active' : ''}`}
            onClick={() => setPeriod('today')}
          >
            {t('community.hot.today')}
          </button>
          <button
            type="button"
            className={`hot-period-tab ${period === 'week' ? 'active' : ''}`}
            onClick={() => setPeriod('week')}
          >
            {t('community.hot.week')}
          </button>
        </div>

        <div className="board-content">
          {loading ? (
            <div className="board-placeholder">{t('common.loading')}</div>
          ) : error ? (
            <div className="board-placeholder">{t('common.loadError')}</div>
          ) : posts.length === 0 ? (
            <div className="board-placeholder">{t('common.empty')}</div>
          ) : (
            <PostListView posts={posts} />
          )}
        </div>
      </main>
    </div>
  )
}

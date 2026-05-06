import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import PostListView from '../components/community/PostListView'
import BoardPagination from '../components/community/BoardPagination'
import { fetchPosts } from '../services/postApi'

const TAB_KEYS = ['all', 'users', 'titles', 'content', 'titles_content']
const TAB_I18N = {
  all: 'search.tabs.all',
  users: 'search.tabs.users',
  titles: 'search.tabs.titlesOnly',
  content: 'search.tabs.contentOnly',
  titles_content: 'search.tabs.titlesContent',
}

const TAB_TO_FIELD = {
  all: 'all',
  users: 'author',
  titles: 'title',
  content: 'body',
  titles_content: 'both',
}

const PAGE_SIZE = 20

export default function CommunitySearchResults() {
  const [params, setParams] = useSearchParams()
  const { t } = useLanguage()
  const query = params.get('q') || ''
  const activeTab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'all'
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1)

  const [posts, setPosts] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateParam(updates) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === undefined || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  function changeTab(tab) {
    updateParam({ tab, page: null })
  }

  function changePage(p) {
    updateParam({ page: p === 1 ? null : String(p) })
  }

  // Fetch only runs when there's an actual query. When `q` is empty the
  // render branch shows a prompt instead — no synchronous state reset here.
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPosts({
      all: true,
      q,
      field: TAB_TO_FIELD[activeTab],
      pageSize: PAGE_SIZE,
      page,
    })
      .then(data => {
        if (cancelled) return
        setPosts(data.posts)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setPosts([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, activeTab, page])

  return (
    <div className="community-results">
      <h1 className="community-results-title">
        {t('communityResults.title')} <span>"{query}"</span>
        {total > 0 && <span className="community-results-count">({total.toLocaleString()})</span>}
      </h1>

      <div className="results-tabs">
        {TAB_KEYS.map(key => (
          <button
            key={key}
            className={`results-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => changeTab(key)}
          >
            {t(TAB_I18N[key])}
          </button>
        ))}
      </div>

      <div className="results-list">
        {!query.trim() ? (
          <div className="results-empty">{t('communityResults.noResults')}</div>
        ) : loading ? (
          <div className="results-empty">{t('common.loading')}</div>
        ) : error ? (
          <div className="results-empty">{t('common.loadError')}</div>
        ) : posts.length === 0 ? (
          <div className="results-empty">
            {t('communityResults.noResults')} "{query}"
          </div>
        ) : (
          <>
            <PostListView posts={posts} showBoard highlightQuery={query} />
            {totalPages > 1 && (
              <div className="results-pagination">
                <BoardPagination
                  currentPage={page}
                  totalPages={totalPages}
                  onChange={changePage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

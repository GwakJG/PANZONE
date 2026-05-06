import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { fetchPosts } from '../services/postApi'
import * as searchesApi from '../services/searchesApi'
import Highlight from '../utils/highlight.jsx'

const HISTORY_KEY = 'pubgop_community_search_history'
const HISTORY_LIMIT = 12
const SUGGEST_LIMIT = 10
const DEBOUNCE_MS = 200

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
  } catch {
    return []
  }
}

function writeLocal(history) {
  if (!history.length) localStorage.removeItem(HISTORY_KEY)
  else localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)))
}

export default function CommunitySearch() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef(null)
  const navigate = useNavigate()

  // Load history whenever auth state changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (user) {
        try {
          const { terms } = await searchesApi.fetchSearches()
          if (!cancelled) setHistory(terms)
        } catch {
          if (!cancelled) setHistory([])
        }
      } else {
        setHistory(readLocal())
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const id = setTimeout(() => {
      fetchPosts({ all: true, q: trimmed, field: 'title', pageSize: SUGGEST_LIMIT })
        .then(data => setSuggestions(data.posts || []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const addToHistory = useCallback(async (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const next = [trimmed, ...history.filter(h => h !== trimmed)].slice(0, HISTORY_LIMIT)
    setHistory(next)
    if (user) {
      try { await searchesApi.addSearch(trimmed) } catch { /* best-effort */ }
    } else {
      writeLocal(next)
    }
  }, [history, user])

  function runSearch(term) {
    const trimmed = term.trim()
    if (!trimmed) return
    addToHistory(trimmed)
    navigate(`/community/search?q=${encodeURIComponent(trimmed)}`)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') runSearch(query)
  }

  function handleSuggestionClick(post) {
    const trimmed = query.trim()
    if (trimmed) addToHistory(trimmed)
    setOpen(false)
    navigate(`/community/${post.boardSlug}/${post.id}`)
  }

  async function clearHistory() {
    setHistory([])
    if (user) {
      try { await searchesApi.clearSearches() } catch { /* best-effort */ }
    } else {
      writeLocal([])
    }
  }

  async function removeHistoryItem(term) {
    const next = history.filter(h => h !== term)
    setHistory(next)
    if (user) {
      try { await searchesApi.removeSearch(term) } catch { /* best-effort */ }
    } else {
      writeLocal(next)
    }
  }

  const trimmed = query.trim()
  const showSuggestions = trimmed.length > 0

  return (
    <div className="community-search" ref={wrapperRef}>
      <div className="community-search-wrapper">
        <input
          className="community-search-input"
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button className="community-search-icon" onClick={() => runSearch(query)} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="search-dropdown">
          {showSuggestions ? (
            <>
              {loading ? (
                <div className="search-no-history">{t('common.loading')}</div>
              ) : suggestions.length > 0 ? (
                <ul className="search-suggest-list">
                  {suggestions.map(p => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="search-suggest-item"
                        onClick={() => handleSuggestionClick(p)}
                      >
                        <span className="search-suggest-title">
                          <Highlight text={p.title} query={trimmed} />
                        </span>
                        <span className="search-suggest-board">
                          {t(`community.board.${p.boardSlug}`)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="search-no-history">{t('search.noSuggestions')}</div>
              )}
              <button
                type="button"
                className="search-view-all"
                onClick={() => runSearch(query)}
              >
                {t('search.viewAll')}
              </button>
            </>
          ) : history.length > 0 ? (
            <div className="search-history">
              <div className="search-history-title">
                <span>{t('search.recentSearches')}</span>
                <button className="search-history-clear" onClick={clearHistory}>
                  {t('search.clear')}
                </button>
              </div>
              {history.map((item, i) => (
                <div
                  key={i}
                  className="search-history-item"
                  onClick={() => runSearch(item)}
                >
                  <span className="search-history-text">{item}</span>
                  <button
                    type="button"
                    className="search-history-remove"
                    onClick={e => { e.stopPropagation(); removeHistoryItem(item) }}
                    aria-label="remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="search-no-history">{t('search.noRecent')}</div>
          )}
        </div>
      )}
    </div>
  )
}

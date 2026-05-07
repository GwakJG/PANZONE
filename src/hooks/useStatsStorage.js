import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import * as favApi from '../services/statsFavoritesApi'

const HISTORY_KEY = 'pubgop_stats_history'
const LEGACY_FAVORITES_KEY = 'pubgop_stats_favorites'

function load(key) {
  try {
    const data = localStorage.getItem(key)
    return data !== null ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function useStatsStorage() {
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const showToast = useToast()

  const [history, setHistory] = useState(() => load(HISTORY_KEY))
  const [favorites, setFavorites] = useState([])
  const migratedUserIdRef = useRef(null)

  // Sync favorites with server when auth state changes; migrate legacy localStorage on first sync.
  useEffect(() => {
    if (!ready) return
    let cancelled = false

    async function sync() {
      if (!user) {
        setFavorites([])
        migratedUserIdRef.current = null
        return
      }

      try {
        if (migratedUserIdRef.current !== user.id) {
          const legacy = load(LEGACY_FAVORITES_KEY)
          if (legacy.length > 0) {
            await Promise.all(
              legacy.map(f =>
                favApi.addFavorite(f.player, f.platform).catch(() => null)
              )
            )
          }
          localStorage.removeItem(LEGACY_FAVORITES_KEY)
          migratedUserIdRef.current = user.id
        }

        const { items } = await favApi.fetchFavorites()
        if (!cancelled) setFavorites(items || [])
      } catch {
        // best-effort; leave favorites empty rather than crash the page
      }
    }

    sync()
    return () => { cancelled = true }
  }, [user, ready])

  const addHistory = useCallback((player, platform) => {
    setHistory(prev => {
      const filtered = prev.filter(
        h => !(h.player === player && h.platform === platform)
      )
      const next = [{ player, platform, timestamp: Date.now() }, ...filtered].slice(0, 20)
      save(HISTORY_KEY, next)
      return next
    })
  }, [])

  const removeHistory = useCallback((player, platform) => {
    setHistory(prev => {
      const next = prev.filter(
        h => !(h.player === player && h.platform === platform)
      )
      save(HISTORY_KEY, next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }, [])

  const promptLogin = useCallback(() => {
    showToast(t('stats.loginRequiredFavorite'))
  }, [showToast, t])

  const toggleFavorite = useCallback((player, platform) => {
    if (!user) {
      promptLogin()
      return
    }
    const exists = favorites.some(
      f => f.player === player && f.platform === platform
    )
    if (exists) {
      setFavorites(prev =>
        prev.filter(f => !(f.player === player && f.platform === platform))
      )
      favApi.removeFavorite(player, platform).catch(() => {})
    } else {
      setFavorites(prev => [
        ...prev,
        { player, platform, timestamp: Date.now() },
      ])
      favApi.addFavorite(player, platform).catch(() => {})
    }
  }, [user, favorites, promptLogin])

  const removeFavorite = useCallback((player, platform) => {
    if (!user) return
    setFavorites(prev =>
      prev.filter(f => !(f.player === player && f.platform === platform))
    )
    favApi.removeFavorite(player, platform).catch(() => {})
  }, [user])

  const clearFavorites = useCallback(() => {
    if (!user) return
    setFavorites([])
    favApi.clearFavorites().catch(() => {})
  }, [user])

  const isFavorite = useCallback((player, platform) => {
    return favorites.some(
      f => f.player === player && f.platform === platform
    )
  }, [favorites])

  return {
    history,
    favorites,
    addHistory,
    removeHistory,
    clearHistory,
    toggleFavorite,
    removeFavorite,
    clearFavorites,
    isFavorite,
  }
}

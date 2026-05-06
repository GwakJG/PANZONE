import { useState, useCallback } from 'react'

const HISTORY_KEY = 'pubgop_stats_history'
const FAVORITES_KEY = 'pubgop_stats_favorites'

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
  const [history, setHistory] = useState(() => load(HISTORY_KEY))
  const [favorites, setFavorites] = useState(() => load(FAVORITES_KEY))

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

  const toggleFavorite = useCallback((player, platform) => {
    setFavorites(prev => {
      const exists = prev.some(
        f => f.player === player && f.platform === platform
      )
      const next = exists
        ? prev.filter(f => !(f.player === player && f.platform === platform))
        : [...prev, { player, platform, timestamp: Date.now() }]
      save(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const removeFavorite = useCallback((player, platform) => {
    setFavorites(prev => {
      const next = prev.filter(
        f => !(f.player === player && f.platform === platform)
      )
      save(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const clearFavorites = useCallback(() => {
    setFavorites([])
    localStorage.removeItem(FAVORITES_KEY)
  }, [])

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

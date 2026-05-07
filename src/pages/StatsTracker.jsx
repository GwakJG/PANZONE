import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import StatsPanel from '../components/StatsPanel'
import ProfileHeader from '../components/stats/ProfileHeader'
import ControlBar from '../components/stats/ControlBar'
import StatsGrid from '../components/stats/StatsGrid'
import DetailTabs from '../components/stats/DetailTabs'
import { useStatsStorage } from '../hooks/useStatsStorage'
import {
  searchPlayer,
  getSeasons,
  getSeasonStats,
  getRankedStats,
  transformSeasonStats,
  transformRankedStats,
} from '../services/pubgApi'

export default function StatsTracker() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const playerParam = params.get('player')

  const [nickname, setNickname] = useState(playerParam || '')
  const [perspective, setPerspective] = useState('tpp')

  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [detectedPlatform, setDetectedPlatform] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState('')
  const [playerStats, setPlayerStats] = useState(null)
  const [matchIds, setMatchIds] = useState([])

  const storage = useStatsStorage()

  // Load player + seasons when search params change
  const loadPlayer = useCallback(async () => {
    if (!playerParam) return
    setLoading(true)
    setError(null)
    setPlayerStats(null)
    setDetectedPlatform(null)

    try {
      // 1. Search player (auto-detect platform)
      const player = await searchPlayer(playerParam)
      const plat = player.platform
      setPlayerId(player.id)
      setMatchIds(player.matchIds)
      setDetectedPlatform(plat)
      storage.addHistory(playerParam, plat)

      // 2. Load seasons
      const seasonList = await getSeasons(plat)
      const recent = seasonList
        .filter(s => s.id.includes('pc-2018'))
        .sort((a, b) => {
          const numA = parseInt(a.id.split('-').pop())
          const numB = parseInt(b.id.split('-').pop())
          return numB - numA
        })

      setSeasons(recent)
      const currentSeason = recent.find(s => s.attributes.isCurrentSeason) || recent[0]
      if (currentSeason) {
        setSeason(currentSeason.id)
        await loadStats(player.id, currentSeason.id, plat)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [playerParam])

  // Load stats for a specific season
  async function loadStats(pid, sid, plat) {
    try {
      const [seasonRaw, rankedRaw] = await Promise.all([
        getSeasonStats(pid, sid, plat).catch(() => null),
        getRankedStats(pid, sid, plat).catch(() => null),
      ])

      setPlayerStats({
        all: transformSeasonStats(seasonRaw),
        ranked: transformRankedStats(rankedRaw),
      })
    } catch {
      setPlayerStats(null)
    }
  }

  useEffect(() => {
    loadPlayer()
  }, [loadPlayer])

  // Season change
  async function handleSeasonChange(newSeason) {
    setSeason(newSeason)
    if (playerId && detectedPlatform) {
      setLoading(true)
      await loadStats(playerId, newSeason, detectedPlatform)
      setLoading(false)
    }
  }

  function handleSearch() {
    const trimmed = nickname.trim()
    if (!trimmed) return
    navigate(`/stats?player=${encodeURIComponent(trimmed)}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleBack() {
    navigate('/stats')
  }

  function handleRefresh() {
    // Just call loadPlayer directly. Previously navigated with &t=Date.now()
    // hoping the URL change would re-trigger the effect, but `playerParam`
    // (params.get('player')) doesn't change, so loadPlayer's useCallback
    // identity stays the same and the effect never re-runs. Direct call
    // bypasses that and refreshes immediately.
    loadPlayer()
  }

  const hasResult = !!playerParam
  const hasError = !!error
  const hasStats = !!playerStats

  return (
    <div className="stats-page">
      {hasResult && (
        <button className="stats-back-btn" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12,19 5,12 12,5" />
          </svg>
          {t('stats.back')}
        </button>
      )}

      {(!hasResult || hasError) && (
        <div className="stats-search-section">
          <h1 className="stats-search-title">{t('stats.title')}</h1>
          <div className="stats-search-box">
            <input
              className="stats-search-input"
              type="text"
              placeholder={t('stats.inputPlaceholder')}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="stats-search-btn" onClick={handleSearch}>
              {t('stats.searchBtn')}
            </button>
          </div>

          {hasError && (
            <div className="stats-not-found">
              {t('stats.playerNotFound', playerParam)}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="stats-loading">
          <div className="stats-spinner" />
          <p>{t('stats.loading')}</p>
        </div>
      )}

      {hasResult && !hasError && !loading && hasStats && (
        <div className="stats-results">
          <ProfileHeader
            player={playerParam}
            platform={detectedPlatform}
            isFavorite={storage.isFavorite(playerParam, detectedPlatform)}
            onToggleFavorite={() => storage.toggleFavorite(playerParam, detectedPlatform)}
            onRefresh={handleRefresh}
          />
          <ControlBar
            perspective={perspective}
            onPerspectiveChange={setPerspective}
            season={season}
            onSeasonChange={handleSeasonChange}
            seasons={seasons}
          />
          <StatsGrid
            playerStats={playerStats}
            perspective={perspective}
          />
          <DetailTabs
            platform={detectedPlatform}
            playerStats={playerStats}
            perspective={perspective}
            matchIds={matchIds}
            playerName={playerParam}
            playerId={playerId}
          />
        </div>
      )}

      {!hasResult && (
        <StatsPanel
          history={storage.history}
          favorites={storage.favorites}
          isFavorite={storage.isFavorite}
          toggleFavorite={storage.toggleFavorite}
          removeHistory={storage.removeHistory}
          removeFavorite={storage.removeFavorite}
          clearHistory={storage.clearHistory}
          clearFavorites={storage.clearFavorites}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import RecentSummary from './RecentSummary'
import MatchList from './MatchList'
import { getMatch } from '../../services/pubgApi'

const TAB_KEYS = [
  'ranked-overall',
  'ranked-duo',
  'ranked-squad',
  'all-overall',
  'all-solo',
  'all-duo',
  'all-squad',
]

const TAB_I18N = {
  'all-overall':     'stats.detailTabs.allOverall',
  'all-solo':        'stats.detailTabs.allSolo',
  'all-duo':         'stats.detailTabs.allDuo',
  'all-squad':       'stats.detailTabs.allSquad',
  'ranked-overall':  'stats.detailTabs.rankedOverall',
  'ranked-duo':      'stats.detailTabs.rankedDuo',
  'ranked-squad':    'stats.detailTabs.rankedSquad',
}

function matchModeFilter(tabKey, perspective) {
  const fpp = perspective === 'fpp'
  if (tabKey.includes('solo')) return fpp ? ['solo-fpp'] : ['solo']
  if (tabKey.includes('duo')) return fpp ? ['duo-fpp'] : ['duo']
  if (tabKey.includes('squad')) return fpp ? ['squad-fpp'] : ['squad']
  // overall = all modes for current perspective
  return fpp ? ['solo-fpp', 'duo-fpp', 'squad-fpp'] : ['solo', 'duo', 'squad']
}

export default function DetailTabs({ platform, perspective, matchIds, playerName, playerId }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('ranked-overall')
  const [matches, setMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  // Load all matches in parallel batches
  useEffect(() => {
    if (!matchIds?.length) {
      setMatches([])
      return
    }

    let cancelled = false
    async function loadMatches() {
      setLoadingMatches(true)
      const loaded = []
      const BATCH_SIZE = 10

      for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
        if (cancelled) break
        const batch = matchIds.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(id => getMatch(id, platform).catch(() => null))
        )
        loaded.push(...results.filter(Boolean))
      }

      if (!cancelled) {
        setMatches(loaded)
        setLoadingMatches(false)
      }
    }

    loadMatches()
    return () => { cancelled = true }
  }, [matchIds, platform])

  // Find my participant in a match
  function findMyParticipant(included) {
    const participants = included.filter(i => i.type === 'participant')
    // Match by player account ID first, then by name
    let me = participants.find(p => p.attributes.stats.playerId === playerId)
    if (!me && playerName) {
      const nameLower = playerName.toLowerCase()
      me = participants.find(p => p.attributes.stats.name.toLowerCase() === nameLower)
    }
    return { me, participants }
  }

  // Find my roster and teammates
  function findMyRoster(included, myParticipantId) {
    const rosters = included.filter(i => i.type === 'roster')
    for (const roster of rosters) {
      const memberIds = roster.relationships?.participants?.data?.map(d => d.id) || []
      if (memberIds.includes(myParticipantId)) {
        return { roster, rosters }
      }
    }
    return { roster: null, rosters }
  }

  // Transform match data for display
  const matchCards = matches
    .map(m => {
      const match = m.data
      if (!match) return null
      const attrs = match.attributes
      // Filter by ranked vs normal
      const isRankedTab = activeTab.startsWith('ranked')
      const isRankedMatch = attrs.matchType === 'competitive'
      if (isRankedTab && !isRankedMatch) return null
      if (!isRankedTab && isRankedMatch) return null

      // Filter by mode (solo/duo/squad) and perspective (fpp/tpp)
      const modeFilter = matchModeFilter(activeTab, perspective)
      if (modeFilter && !modeFilter.includes(attrs.gameMode)) return null

      const included = m.included || []
      const { me, participants } = findMyParticipant(included)
      if (!me) return null

      const stats = me.attributes.stats
      const { roster, rosters } = findMyRoster(included, me.id)
      const rank = roster?.attributes?.stats?.rank || stats.winPlace || 0

      // Find teammates
      const teamMemberIds = roster?.relationships?.participants?.data?.map(d => d.id) || []
      const teammates = teamMemberIds
        .filter(id => id !== me.id)
        .map(id => {
          const p = participants.find(pp => pp.id === id)
          return p ? p.attributes.stats.name : null
        })
        .filter(Boolean)

      return {
        id: match.id,
        date: attrs.createdAt,
        mode: attrs.gameMode,
        mapName: attrs.mapName,
        rank,
        totalTeams: rosters.length,
        kills: stats.kills,
        damage: Math.round(stats.damageDealt),
        distance: Math.round((stats.rideDistance + stats.walkDistance + stats.swimDistance) / 1000 * 10) / 10,
        survivalTime: Math.round(stats.timeSurvived / 60 * 10) / 10,
        teammates,
        // raw data for dropdown
        myId: me.id,
        participants,
        rosters,
      }
    })
    .filter(Boolean)

  // PUBG only returns the player's most recent ~14 matches across all
  // seasons. The match list/summary therefore always reflects the latest
  // matches that pass the active tab/mode/perspective filters — independent
  // of the season selector above.
  const recentMatchCards = matchCards
  const recentGames = recentMatchCards.slice(0, 20).map(m => ({
    rank: m.rank,
    kills: m.kills,
    damage: m.damage,
    survivalTime: m.survivalTime,
  }))

  return (
    <div className="detail-tabs-section">
      <h3 className="recent-matches-title">{t('stats.recent.matchesTitle')}</h3>
      <div className="detail-tabs">
        {TAB_KEYS.map(key => (
          <button
            key={key}
            className={`detail-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {t(TAB_I18N[key])}
          </button>
        ))}
      </div>
      <div className="detail-tabs-content">
        {loadingMatches ? (
          <div className="stats-loading">
            <div className="stats-spinner" />
            <p>{t('stats.loadingMatches')}</p>
          </div>
        ) : recentMatchCards.length > 0 ? (
          <>
            <RecentSummary games={recentGames} />
            <MatchList matches={recentMatchCards} platform={platform} />
          </>
        ) : (
          <div className="stats-card-empty">
            {t('stats.noData')}
          </div>
        )}
      </div>
    </div>
  )
}

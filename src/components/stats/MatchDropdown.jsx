import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'

function round1(n) { return Math.round(n * 10) / 10 }
function kmFromM(m) { return round1(m / 1000) }
function formatTime(seconds) {
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

function buildData(match) {
  const { participants, rosters, myId } = match

  // Build participant map: participantId -> stats
  const pMap = {}
  for (const p of participants) {
    const s = p.attributes.stats
    pMap[p.id] = {
      name: s.name,
      kills: s.kills,
      damage: Math.round(s.damageDealt),
      assists: s.assists,
      knocks: s.DBNOs || 0,
      headshots: s.headshotKills || 0,
      survivalTime: formatTime(s.timeSurvived),
      walkDistance: kmFromM(s.walkDistance),
      rideDistance: kmFromM(s.rideDistance),
      swimDistance: kmFromM(s.swimDistance || 0),
      distance: kmFromM(s.walkDistance + s.rideDistance + (s.swimDistance || 0)),
      heals: s.heals || 0,
      boosts: s.boosts || 0,
      revives: s.revives || 0,
      isMe: p.id === myId,
    }
  }

  // Build teams from rosters
  const allTeams = rosters
    .map(r => {
      const rank = r.attributes?.stats?.rank || 0
      const memberIds = r.relationships?.participants?.data?.map(d => d.id) || []
      const members = memberIds.map(id => pMap[id]).filter(Boolean)
      const totalKills = members.reduce((s, m) => s + m.kills, 0)
      const totalDamage = members.reduce((s, m) => s + m.damage, 0)
      const avgDistance = members.length > 0
        ? round1(members.reduce((s, m) => s + m.distance, 0) / members.length)
        : 0
      const isMyTeam = memberIds.includes(myId)
      return {
        rank,
        members: members.map(m => m.name),
        totalKills,
        totalDamage,
        avgDistance,
        isMyTeam,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  // My team stats
  const myTeam = allTeams.find(t => t.isMyTeam)
  const myRoster = rosters.find(r => {
    const ids = r.relationships?.participants?.data?.map(d => d.id) || []
    return ids.includes(myId)
  })
  const myMemberIds = myRoster?.relationships?.participants?.data?.map(d => d.id) || []
  const teamStats = myMemberIds.map(id => pMap[id]).filter(Boolean)

  // My summary
  const me = pMap[myId] || {}

  return { allTeams, myTeam, teamStats, summary: me }
}

export default function MatchDropdown({ match }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [tab, setTab] = useState('ranking')

  const { allTeams, teamStats, summary } = useMemo(() => buildData(match), [match])

  const teamTotalKills = teamStats.reduce((s, p) => s + p.kills, 0)
  const teamTotalDamage = teamStats.reduce((s, p) => s + p.damage, 0)

  function handlePlayerClick(name) {
    navigate(`/stats?player=${encodeURIComponent(name)}`)
  }

  const tabs = [
    { key: 'ranking', label: t('stats.dropdown.ranking') },
    { key: 'teamStats', label: t('stats.dropdown.teamStats') },
    { key: 'summary', label: t('stats.dropdown.summary') },
  ]

  return (
    <div className="match-dropdown">
      <div className="dropdown-header">
        <div className="dropdown-header-stat">
          <span className="dropdown-header-label">{t('stats.dropdown.totalKills')}</span>
          <span className="dropdown-header-value">{teamTotalKills}</span>
        </div>
        <div className="dropdown-header-stat">
          <span className="dropdown-header-label">{t('stats.dropdown.totalDamage')}</span>
          <span className="dropdown-header-value">{teamTotalDamage.toLocaleString()}</span>
        </div>
      </div>

      <div className="match-dropdown-tabs">
        {tabs.map(tb => (
          <button
            key={tb.key}
            className={`match-dropdown-tab ${tab === tb.key ? 'active' : ''}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'ranking' && (
        <div className="dropdown-ranking">
          <div className="dropdown-table-head">
            <span className="dt-rank">{t('stats.dropdown.rank')}</span>
            <span className="dt-members">{t('stats.dropdown.members')}</span>
            <span className="dt-num">{t('stats.fields.kills')}</span>
            <span className="dt-num">{t('stats.match.damage')}</span>
            <span className="dt-num">{t('stats.match.distance')}</span>
          </div>
          <div className="dropdown-table-body">
            {allTeams.map(team => (
              <div
                key={team.rank}
                className={`dropdown-table-row ${team.isMyTeam ? 'highlight' : ''}`}
              >
                <span className="dt-rank">#{team.rank}</span>
                <span className="dt-members">
                  {team.members.map((name, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      <span
                        className="dt-member-link"
                        onClick={() => handlePlayerClick(name)}
                      >
                        {name}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="dt-num">{team.totalKills}</span>
                <span className="dt-num">{team.totalDamage}</span>
                <span className="dt-num">{team.avgDistance}km</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'teamStats' && (
        <div className="dropdown-team">
          <div className="dropdown-table-head">
            <span className="dt-members">{t('stats.dropdown.members')}</span>
            <span className="dt-num">{t('stats.fields.kills')}</span>
            <span className="dt-num">{t('stats.match.damage')}</span>
            <span className="dt-num">{t('stats.dropdown.assists')}</span>
            <span className="dt-num">{t('stats.dropdown.knocks')}</span>
            <span className="dt-num">{t('stats.dropdown.survTime')}</span>
          </div>
          {teamStats.map((p, i) => (
            <div key={i} className={`dropdown-table-row ${p.isMe ? 'highlight' : ''}`}>
              <span className="dt-members">
                <span
                  className="dt-member-link"
                  onClick={() => handlePlayerClick(p.name)}
                >
                  {p.name}
                </span>
              </span>
              <span className="dt-num">{p.kills}</span>
              <span className={`dt-num ${p.damage >= 800 ? 'high-dmg' : ''}`}>{p.damage}</span>
              <span className="dt-num">{p.assists}</span>
              <span className="dt-num">{p.knocks}</span>
              <span className="dt-num">{p.survivalTime}</span>
            </div>
          ))}
          <div className="dropdown-table-row total">
            <span className="dt-members">{t('stats.dropdown.total')}</span>
            <span className="dt-num">{teamTotalKills}</span>
            <span className="dt-num">{teamTotalDamage}</span>
            <span className="dt-num">{teamStats.reduce((s, p) => s + p.assists, 0)}</span>
            <span className="dt-num">{teamStats.reduce((s, p) => s + p.knocks, 0)}</span>
            <span className="dt-num"></span>
          </div>
        </div>
      )}

      {tab === 'summary' && (
        <div className="dropdown-summary">
          <div className="summary-section">
            <h4 className="summary-section-title">{t('stats.dropdown.combat')}</h4>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-val">{summary.damage}</span>
                <span className="summary-lbl">{t('stats.match.damage')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.kills} ({summary.headshots})</span>
                <span className="summary-lbl">{t('stats.fields.kills')} ({t('stats.dropdown.headshots')})</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.assists}</span>
                <span className="summary-lbl">{t('stats.dropdown.assists')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.knocks}</span>
                <span className="summary-lbl">{t('stats.dropdown.knocks')}</span>
              </div>
            </div>
          </div>
          <div className="summary-section">
            <h4 className="summary-section-title">{t('stats.dropdown.movement')}</h4>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-val">{summary.distance} km</span>
                <span className="summary-lbl">{t('stats.match.distance')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.walkDistance} km</span>
                <span className="summary-lbl">{t('stats.dropdown.walkDist')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.rideDistance} km</span>
                <span className="summary-lbl">{t('stats.dropdown.rideDist')}</span>
              </div>
            </div>
          </div>
          <div className="summary-section">
            <h4 className="summary-section-title">{t('stats.dropdown.survival')}</h4>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-val">{summary.heals} / {summary.boosts}</span>
                <span className="summary-lbl">{t('stats.dropdown.healsBoosts')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-val">{summary.revives}</span>
                <span className="summary-lbl">{t('stats.dropdown.revives')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

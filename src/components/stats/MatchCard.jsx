import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import MatchDropdown from './MatchDropdown'

function formatDate(iso) {
  const d = new Date(iso)
  const date = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export default function MatchCard({ match, platform }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const { date, time } = formatDate(match.date)
  const isWin = match.rank === 1

  function handleTeammateClick(e, name) {
    e.stopPropagation()
    navigate(`/stats?player=${encodeURIComponent(name)}`)
  }

  return (
    <div className={`match-card-wrapper ${expanded ? 'expanded' : ''} ${isWin ? 'win' : match.rank <= 10 ? 'top10' : ''}`}>
      <div
        className={`match-card ${isWin ? 'win' : match.rank <= 10 ? 'top10' : ''}`}
        onClick={() => setExpanded(prev => !prev)}
        style={{ cursor: 'pointer' }}
      >
        <div className="match-card-map">
          <span className="match-map-name">{t(`stats.maps.${match.mapName}`)}</span>
        </div>

        <div className="match-card-date">
          <span className="match-date-day">{date}</span>
          <span className="match-date-time">{time}</span>
        </div>

        <div className={`match-card-rank ${isWin ? 'win' : match.rank <= 10 ? 'top10' : ''}`}>
          <span className="match-rank-value">#{match.rank}</span>
          <span className="match-rank-total">/{match.totalTeams}</span>
        </div>

        <div className="match-card-stat">
          <span className="match-stat-label">{t('stats.fields.kills')}</span>
          <span className="match-stat-value">{match.kills}</span>
        </div>

        <div className="match-card-stat">
          <span className="match-stat-label">{t('stats.match.damage')}</span>
          <span className="match-stat-value">{match.damage}</span>
        </div>

        <div className="match-card-stat">
          <span className="match-stat-label">{t('stats.match.distance')}</span>
          <span className="match-stat-value">{match.distance}<span className="match-stat-unit">km</span></span>
        </div>

        <div className="match-card-teammates">
          {match.teammates.length > 0 ? (
            match.teammates.map((name, i) => (
              <span
                key={i}
                className="match-teammate"
                onClick={e => handleTeammateClick(e, name)}
              >
                {name}
              </span>
            ))
          ) : (
            <span className="match-no-team">Solo</span>
          )}
        </div>

        <span className={`match-card-expand ${expanded ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </span>
      </div>

      {expanded && <MatchDropdown match={match} platform={platform} />}
    </div>
  )
}

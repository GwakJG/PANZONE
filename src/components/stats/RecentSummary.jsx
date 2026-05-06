import { useLanguage } from '../../context/LanguageContext'

export default function RecentSummary({ games }) {
  const { t } = useLanguage()

  const totalKills = games.reduce((s, g) => s + g.kills, 0)
  const totalDeaths = games.filter(g => g.rank > 1).length
  const avgKd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2)
  const avgDamage = (games.reduce((s, g) => s + g.damage, 0) / games.length).toFixed(0)
  const avgSurvival = (games.reduce((s, g) => s + g.survivalTime, 0) / games.length).toFixed(1)
  const avgRank = (games.reduce((s, g) => s + g.rank, 0) / games.length).toFixed(1)

  return (
    <div className="recent-summary">
      <div className="recent-summary-col">
        <span className="recent-summary-title">{t('stats.recent.title')}</span>
        <div className="recent-summary-stats">
          <div className="recent-stat">
            <span className="recent-stat-label">{t('stats.fields.kd')}</span>
            <span className="recent-stat-value">{avgKd}</span>
          </div>
          <div className="recent-stat">
            <span className="recent-stat-label">{t('stats.fields.damagePerMatch')}</span>
            <span className="recent-stat-value">{avgDamage}</span>
          </div>
          <div className="recent-stat">
            <span className="recent-stat-label">{t('stats.fields.avgSurvivalTime')}</span>
            <span className="recent-stat-value">{avgSurvival}<span className="recent-stat-unit">{t('stats.units.minutes')}</span></span>
          </div>
        </div>
      </div>
      <div className="recent-summary-col recent-summary-right">
        <div className="recent-avgrank">
          <span className="recent-summary-title">{t('stats.recent.avgRank')}</span>
          <span className="recent-avgrank-value">#{avgRank}</span>
        </div>
        <div className="recent-rank-history">
          {games.map((g, i) => (
            <span
              key={i}
              className={`rank-box ${g.rank === 1 ? 'win' : g.rank <= 10 ? 'top10' : ''}`}
            >
              {g.rank}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import TierBadge from '../../components/TierBadge'

const HIGHLIGHT_FIELDS = [
  { key: 'kd',             i18n: 'stats.fields.kd',             unit: null },
  { key: 'damagePerMatch', i18n: 'stats.fields.damagePerMatch', unit: null },
]

const STAT_FIELDS = [
  { key: 'kda',             i18n: 'stats.fields.kda',             unit: null },
  { key: 'winRate',         i18n: 'stats.fields.winRate',         unit: 'stats.units.percent' },
  { key: 'top10Rate',       i18n: 'stats.fields.top10Rate',       unit: 'stats.units.percent' },
  { key: 'longestKill',     i18n: 'stats.fields.longestKill',     unit: 'stats.units.meters' },
  { key: 'avgSurvivalTime', i18n: 'stats.fields.avgSurvivalTime', unit: 'stats.units.minutes' },
  { key: 'headshotRate',    i18n: 'stats.fields.headshotRate',    unit: 'stats.units.percent' },
  { key: 'avgRank',         i18n: 'stats.fields.avgRank',         unit: null },
  { key: 'avgKills',        i18n: 'stats.fields.avgKills',        unit: null },
  { key: 'avgAssists',      i18n: 'stats.fields.avgAssists',      unit: null },
]

export default function StatsCard({ title, data, hasModeSelect, modes, showTier }) {
  const { t } = useLanguage()
  const modeList = modes || ['solo', 'duo', 'squad']
  const [mode, setMode] = useState(modeList[0])

  const stats = hasModeSelect ? data?.[mode] : data?.overall

  return (
    <div className="stats-card">
      <div className="stats-card-header">
        <h3 className="stats-card-title">{title}</h3>
        {showTier && stats?.tier && (
          <TierBadge tier={stats.tier.tier} subTier={stats.tier.subTier} rp={stats.tier.rp} />
        )}
        {hasModeSelect && (
          <div className="stats-mode-toggle">
            {modeList.map(m => (
              <button
                key={m}
                className={`stats-mode-btn ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
              >
                {t(`stats.mode.${m}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {stats ? (
        <>
          <div className="stats-card-summary">
            <span className="stats-card-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
                <path d="M13 7l4-4 4 4-4 4" />
                <path d="M7 13l-4 4 4 4 4-4" />
              </svg>
              {stats.matches ?? 0} {t('stats.fields.matches')}
            </span>
            <span className="stats-card-badge wins">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              {stats.wins ?? 0} {t('stats.fields.wins')}
            </span>
          </div>

          <div className="stats-card-highlight">
            {HIGHLIGHT_FIELDS.map(field => (
              <div className="stat-highlight" key={field.key}>
                <span className="stat-label">{t(field.i18n)}</span>
                <span className="stat-value">
                  {stats[field.key] ?? '-'}
                  {field.unit && <span className="stat-unit">{t(field.unit)}</span>}
                </span>
              </div>
            ))}
          </div>

          <div className="stats-card-grid">
            {STAT_FIELDS.filter(field => {
              const v = stats[field.key]
              if (field.key === 'avgRank' && !v) return false
              if (field.key === 'longestKill' && !v) return false
              if (field.key === 'avgSurvivalTime' && !v) return false
              if (field.key === 'headshotRate' && !v) return false
              return true
            }).map(field => (
              <div className="stat-item" key={field.key}>
                <span className="stat-label">{t(field.i18n)}</span>
                <span className="stat-value">
                  {stats[field.key] ?? '-'}
                  {field.unit && <span className="stat-unit">{t(field.unit)}</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="stats-card-empty">
          {t('stats.noData')}
        </div>
      )}
    </div>
  )
}

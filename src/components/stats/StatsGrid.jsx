import { useLanguage } from '../../context/LanguageContext'
import StatsCard from './StatsCard'

export default function StatsGrid({ playerStats, perspective }) {
  const { t } = useLanguage()

  const ranked = playerStats?.ranked?.[perspective]
  const all = playerStats?.all?.[perspective]

  return (
    <div className="stats-grid">
      <StatsCard
        title={t('stats.category.rankedOverall')}
        data={ranked}
        hasModeSelect={false}
        showTier
      />
      <StatsCard
        title={t('stats.category.rankedByMode')}
        data={ranked}
        hasModeSelect={true}
        modes={['duo', 'squad']}
      />
      <StatsCard
        title={t('stats.category.overallAll')}
        data={all}
        hasModeSelect={false}
      />
      <StatsCard
        title={t('stats.category.allByMode')}
        data={all}
        hasModeSelect={true}
      />
    </div>
  )
}

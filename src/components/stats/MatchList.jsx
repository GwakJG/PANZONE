import { useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import MatchCard from './MatchCard'

const PAGE_SIZE = 20

export default function MatchList({ matches, platform }) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(PAGE_SIZE)

  const shown = matches.slice(0, visible)
  const hasMore = visible < matches.length

  return (
    <div className="match-list">
      {shown.map(match => (
        <MatchCard key={match.id} match={match} platform={platform} />
      ))}
      {hasMore && (
        <button
          className="match-load-more"
          onClick={() => setVisible(prev => prev + PAGE_SIZE)}
        >
          {t('stats.match.loadMore')}
        </button>
      )}
    </div>
  )
}

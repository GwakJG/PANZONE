import { useState, useEffect } from 'react'
import TierBadge from './TierBadge'
import { getPlayerTier } from '../services/pubgApi'

export default function PlayerCard({ player, platform, isFavorite, onFavorite, onDelete, onClick }) {
  const [tier, setTier] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPlayerTier(player, platform).then(t => {
      if (!cancelled) setTier(t)
    })
    return () => { cancelled = true }
  }, [player])

  return (
    <div className="player-card" onClick={onClick}>
      <div className="player-card-left">
        <img
          className="player-card-avatar"
          src={platform === 'kakao' ? '/platform-kakao.svg' : '/platform-steam.svg'}
          alt={platform}
        />
        <span className="player-card-name">{player}</span>
      </div>
      <div className="player-card-right">
        {tier && (
          <TierBadge tier={tier.tier} subTier={tier.subTier} rp={tier.rp} compact />
        )}
        <div className="player-card-actions">
          <button
            className={`player-card-btn fav ${isFavorite ? 'active' : ''}`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={e => { e.stopPropagation(); onFavorite() }}
          >
            {isFavorite ? '\u2605' : '\u2606'}
          </button>
          <button
            className="player-card-btn delete"
            title="Delete"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

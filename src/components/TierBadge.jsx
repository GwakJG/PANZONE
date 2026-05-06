function getTierImage(tier, subTier) {
  if (!tier) return '/tiers/Unranked.png'
  if (tier === 'Master' || tier === 'Survivor') return `/tiers/${tier}.png`
  return `/tiers/${tier}-${subTier || 5}.png`
}

export default function TierBadge({ tier, subTier, rp, compact = false }) {
  if (!tier) return null

  const src = getTierImage(tier, subTier)
  const size = compact ? 44 : 80

  return (
    <div className={`tier-badge ${compact ? 'compact' : ''}`}>
      <img
        className="tier-badge-img"
        src={src}
        alt={`${tier} ${subTier || ''}`}
        width={size}
        height={size}
      />
      {compact ? (
        <span className="tier-badge-text">{tier} {subTier || ''}</span>
      ) : (
        <div className="tier-badge-info">
          <span className="tier-badge-text">{tier} {subTier || ''}</span>
          {rp != null && <span className="tier-badge-rp">{rp.toLocaleString()} RP</span>}
        </div>
      )}
    </div>
  )
}

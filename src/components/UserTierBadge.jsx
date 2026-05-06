// Community progression tier badge (tier 0-4).
// Tier 0: no badge (신규). Tier 1-4: bullet SVG in bronze/silver/gold/diamond.
// Distinct from the PUBG rank `TierBadge` (game stats).
import { useLanguage } from '../context/LanguageContext'

// Paired fill / outline colors. Body uses the lighter fill, rim the darker
// tone for the casing base and outline so the shape reads at small sizes.
const TIER_COLORS = {
  1: { body: '#cd7f32', rim: '#8b5a2b' }, // bronze
  2: { body: '#c0c0c0', rim: '#808080' }, // silver
  3: { body: '#ffd700', rim: '#b8860b' }, // gold
  4: { body: '#b9f2ff', rim: '#3498db' }, // diamond (admin)
}

function Bullet({ tier }) {
  const c = TIER_COLORS[tier]
  if (!c) return null
  return (
    <svg
      width="26"
      height="10"
      viewBox="0 0 40 18"
      aria-hidden="true"
      className="user-tier-bullet"
    >
      {/* full outer silhouette: rectangular casing + ogive (rounded) tip on the right */}
      <path
        d="M 3 3 L 22 3 Q 36 9 22 15 L 3 15 Z"
        fill={c.body}
        stroke={c.rim}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* casing rim strip at the base (left edge) */}
      <rect x="2.5" y="3" width="3" height="12" fill={c.rim} />
      {/* faint seam between casing and bullet tip */}
      <line
        x1="22"
        y1="3"
        x2="22"
        y2="15"
        stroke={c.rim}
        strokeWidth="1"
        opacity="0.55"
      />
    </svg>
  )
}

export default function UserTierBadge({ tier }) {
  const { t } = useLanguage()
  if (tier === null || tier === undefined) return null
  if (tier < 0 || tier > 4) return null

  const content = tier === 0
    ? <span className="user-tier-emoji">🐣</span>
    : <Bullet tier={tier} />

  return (
    <span
      className={`user-tier-badge user-tier-${tier}`}
      title={t(`tier.tier${tier}`)}
      aria-label={t(`tier.tier${tier}`)}
    >
      {content}
    </span>
  )
}

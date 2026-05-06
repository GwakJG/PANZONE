import { useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import Toast from '../Toast'

export default function ProfileHeader({ player, platform, isFavorite, onToggleFavorite, onRefresh }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const now = new Date().toLocaleString()

  function handleCopy() {
    navigator.clipboard.writeText(player)
    setCopied(true)
  }

  return (
    <>
      {copied && <Toast message={t('stats.copied')} onClose={() => setCopied(false)} />}
      <div className="profile-header">
      <div className="profile-header-left">
        <img
          className="profile-avatar"
          src={platform === 'kakao' ? '/platform-kakao.svg' : '/platform-steam.svg'}
          alt={platform}
        />
      </div>
      <div className="profile-header-center">
        <div className="profile-name-row">
          <h1 className="profile-name">{player}</h1>
          <button className="profile-copy-btn" onClick={handleCopy} title="Copy nickname">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
        <div className="profile-meta">
          <button className="profile-refresh-btn" onClick={onRefresh} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23,4 23,10 17,10" />
              <polyline points="1,20 1,14 7,14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
          </button>
          <span className="profile-updated">
            {t('stats.lastUpdated')}: {now}
          </span>
        </div>
      </div>
      <div className="profile-header-right">
        <button
          className={`profile-fav-btn ${isFavorite ? 'active' : ''}`}
          title={isFavorite ? t('stats.removeFavorite') : t('stats.addFavorite')}
          onClick={onToggleFavorite}
        >
          {isFavorite ? '\u2605' : '\u2606'}
        </button>
      </div>
    </div>
    </>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import PlayerCard from './PlayerCard'

export default function StatsPanel({
  history,
  favorites,
  isFavorite,
  toggleFavorite,
  removeHistory,
  removeFavorite,
  clearHistory,
  clearFavorites,
}) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('history')
  const navigate = useNavigate()

  const tabs = [
    { key: 'history', label: t('stats.tabs.history') },
    { key: 'favorites', label: t('stats.tabs.favorites') },
  ]

  const list = activeTab === 'history' ? history : favorites

  function handleClick(player) {
    navigate(`/stats?player=${encodeURIComponent(player)}`)
  }

  function handleDelete(player, platform) {
    if (activeTab === 'history') {
      removeHistory(player, platform)
    } else {
      removeFavorite(player, platform)
    }
  }

  function handleClearAll() {
    if (activeTab === 'history') {
      clearHistory()
    } else {
      clearFavorites()
    }
  }

  return (
    <div className="stats-panel">
      <div className="stats-panel-header">
        <div className="stats-panel-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`stats-panel-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {list.length > 0 && (
          <button className="stats-panel-clear" onClick={handleClearAll}>
            {t('stats.clearAll')}
          </button>
        )}
      </div>

      <div className="stats-panel-list">
        {list.length > 0 ? (
          list.map(item => (
            <PlayerCard
              key={`${item.player}-${item.platform}`}
              player={item.player}
              platform={item.platform}
              isFavorite={isFavorite(item.player, item.platform)}
              onFavorite={() => toggleFavorite(item.player, item.platform)}
              onDelete={() => handleDelete(item.player, item.platform)}
              onClick={() => handleClick(item.player, item.platform)}
            />
          ))
        ) : (
          <div className="stats-panel-empty">
            {activeTab === 'history'
              ? t('stats.emptyHistory')
              : t('stats.emptyFavorites')}
          </div>
        )}
      </div>
    </div>
  )
}

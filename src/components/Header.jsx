import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import CommunitySearch from './CommunitySearch'
import LanguageToggle from './LanguageToggle'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import LoginButton from './LoginButton'

export default function Header() {
  const location = useLocation()
  const { t } = useLanguage()

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="header-logo">
          <img src="/logo.png" alt="PanZone" className="header-logo-img" />
        </Link>
        <nav className="header-nav">
          <Link to="/" className={(location.pathname === '/' || location.pathname.startsWith('/community')) && location.pathname !== '/community/search' ? 'active' : ''}>
            {t('header.community')}
          </Link>
          <Link to="/stats" className={location.pathname === '/stats' ? 'active' : ''}>
            {t('header.statsTracker')}
          </Link>
        </nav>
      </div>
      <div className="header-right">
        <CommunitySearch />
        <LanguageToggle />
        <ThemeToggle />
        <NotificationBell />
        <LoginButton />
      </div>
    </header>
  )
}

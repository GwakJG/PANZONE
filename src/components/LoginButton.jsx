import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { avatarOf } from '../utils/avatar'

export default function LoginButton() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!user) {
    return (
      <Link to="/login" className="login-btn">
        {t('login.login')}
      </Link>
    )
  }

  function handleLogout() {
    logout()
    setOpen(false)
    showToast(t('login.loggedOut'), 'success')
  }

  return (
    <div className="login-menu" ref={rootRef}>
      <button className="login-btn logged-in" onClick={() => setOpen(v => !v)}>
        <img src={avatarOf(user.avatarUrl)} alt="" className="login-avatar" />
        <span className="login-name">{user.name}</span>
      </button>
      {open && (
        <div className="login-menu-dropdown">
          <Link
            to={`/user/${encodeURIComponent(user.name)}`}
            className="login-menu-item"
            onClick={() => setOpen(false)}
          >
            {t('login.profile')}
          </Link>
          {(user.role === 'admin' || user.role === 'mod') && (
            <Link
              to="/admin"
              className="login-menu-item"
              onClick={() => setOpen(false)}
            >
              {t('login.admin')}
            </Link>
          )}
          <button type="button" className="login-menu-item" onClick={handleLogout}>
            {t('login.logout')}
          </button>
        </div>
      )}
    </div>
  )
}

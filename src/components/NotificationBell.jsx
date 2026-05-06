import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useApiError } from '../hooks/useApiError'
import {
  fetchNotifications,
  fetchUnreadCount,
  markRead,
  markAllRead,
} from '../services/notificationApi'

const POLL_INTERVAL_MS = 60 * 1000 // 1 minute — cheap unread-count poll

function relTime(iso, t) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Math.max(0, Date.now() - d.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('notification.justNow')
  if (mins < 60) return t('notification.minsAgo', mins)
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('notification.hoursAgo', hrs)
  const days = Math.floor(hrs / 24)
  if (days < 7) return t('notification.daysAgo', days)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function NotificationBell() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatError = useApiError()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  const loadCount = useCallback(async () => {
    if (!user) return
    try {
      const { unreadCount } = await fetchUnreadCount()
      setUnreadCount(unreadCount)
    } catch {
      // silently — we don't want the bell to spam toasts
    }
  }, [user])

  // Initial fetch + periodic refresh while logged in
  useEffect(() => {
    if (!user) {
      setUnreadCount(0)
      setNotifications([])
      return
    }
    loadCount()
    const id = setInterval(loadCount, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user, loadCount])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      try {
        const { notifications, unreadCount } = await fetchNotifications({ pageSize: 15 })
        setNotifications(notifications)
        setUnreadCount(unreadCount)
      } catch (err) {
        console.error('[notifications]', formatError(err))
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleItemClick(n) {
    setOpen(false)
    if (!n.read) {
      try {
        await markRead(n.id)
        setUnreadCount(c => Math.max(0, c - 1))
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      } catch { /* ignore */ }
    }
    // Always jump to the notifications tab with focus on this item —
    // the profile tab auto-navigates to the right page and scrolls/highlights.
    // The linkUrl (if any) is still reachable via the profile detail modal's
    // "이동" button, which is the less common action.
    navigate(`/user/${encodeURIComponent(user.name)}?tab=notifications&focus=${n.id}`)
  }

  async function handleMarkAll() {
    try {
      await markAllRead()
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => n.read ? n : { ...n, read: true }))
    } catch { /* ignore */ }
  }

  if (!user) return null

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? t('notification.unreadCount', unreadCount) : t('notification.label')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-bell-dropdown">
          <div className="notif-bell-head">
            <span className="notif-bell-title">{t('notification.label')}</span>
            <div className="notif-bell-head-actions">
              {unreadCount > 0 && (
                <button type="button" className="notif-bell-mark-all" onClick={handleMarkAll}>
                  {t('notification.markAllRead')}
                </button>
              )}
              <button
                type="button"
                className="notif-bell-open-page"
                onClick={() => {
                  setOpen(false)
                  navigate(`/user/${encodeURIComponent(user.name)}?tab=notifications`)
                }}
                aria-label={t('notification.goToPage')}
                title={t('notification.goToPage')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
          <div className="notif-bell-list">
            {loading ? (
              <div className="notif-bell-empty">{t('common.loading')}</div>
            ) : notifications.length === 0 ? (
              <div className="notif-bell-empty">{t('notification.empty')}</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-bell-item ${n.read ? '' : 'is-unread'}`}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="notif-bell-item-title">
                    {!n.read && <span className="notif-bell-dot" aria-hidden="true" />}
                    {n.title}
                  </div>
                  {n.body && <div className="notif-bell-item-body">{n.body}</div>}
                  <div className="notif-bell-item-time">{relTime(n.createdAt, t)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

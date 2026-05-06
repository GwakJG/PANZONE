import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PostListView from '../components/community/PostListView'
import BoardPagination from '../components/community/BoardPagination'
import AuthorMenu from '../components/community/AuthorMenu'
import ConfirmModal from '../components/ConfirmModal'
import ProfileEditModal from '../components/ProfileEditModal'
import InquiryModal from '../components/InquiryModal'
import UserTierBadge from '../components/UserTierBadge'
import { avatarOf } from '../utils/avatar'
import { copyToClipboard } from '../utils/clipboard'
import PasswordInput from '../components/PasswordInput'
import { fetchUser, fetchUserPosts } from '../services/userApi'
import { deleteAccount } from '../services/authApi'
import { suspendUser, unsuspendUser } from '../services/adminApi'
import { submitInquiry } from '../services/inquiryApi'
import { fetchNotifications, markRead, markAllRead, deleteNotification, fetchNotificationPage, fetchAllNotificationIds } from '../services/notificationApi'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'

const PAGE_SIZE = 20

const NOTIF_KIND_LABEL = {
  admin_message: '운영팀 메시지',
  post_deleted: '게시글 삭제',
  suspended: '계정 정지',
  unsuspended: '정지 해제',
  inquiry_resolved: '문의 답변',
  report_resolved: '신고 처리',
  system: '시스템',
}

function formatNotifTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${dd} ${hh}:${mi}`
}

const NOTIF_BODY_LONG_THRESHOLD = 100

function NotificationsPanel({
  notifications, unread, loading, page, onPageChange,
  onItemClick, onBulkRead, onBulkDelete, onMarkAllRead,
  focusId, onFocusHandled, totalCount,
}) {
  const { t } = useLanguage()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [allAcross, setAllAcross] = useState(false) // selection covers every page
  const [detailOf, setDetailOf] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const itemRefs = useRef(new Map())
  const [highlightId, setHighlightId] = useState(null)

  // Scroll the focused item into view + flash a highlight ring.
  useEffect(() => {
    if (!focusId || loading) return
    const el = itemRefs.current.get(focusId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(focusId)
    const tid = setTimeout(() => {
      setHighlightId(null)
      onFocusHandled && onFocusHandled()
    }, 2000)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, notifications])

  // Drop selection when the visible data changes (page nav, refetch). Keeping
  // stale selections would mean "모두 읽음" silently affects items the user
  // can't see — surprising UX. `allAcross` is the one exception: the user
  // explicitly opted into cross-page selection so we keep it until they cancel.
  useEffect(() => {
    if (allAcross) return
    setSelected(new Set())
  }, [notifications, allAcross])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(notifications.map(n => n.id)))
    setAllAcross(false)
  }

  async function selectAllAcross() {
    try {
      const { ids } = await fetchAllNotificationIds()
      setSelected(new Set(ids))
      setAllAcross(true)
    } catch { /* ignore */ }
  }

  function clearAcross() {
    setSelected(new Set())
    setAllAcross(false)
  }

  function exitSelect() {
    setSelectMode(false)
    setSelected(new Set())
    setAllAcross(false)
  }

  async function handleBulkRead() {
    const ids = Array.from(selected)
    if (!ids.length) { exitSelect(); return }
    await onBulkRead(ids)
    exitSelect()
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected)
    setDeleteConfirm(false)
    if (!ids.length) { exitSelect(); return }
    await onBulkDelete(ids)
    exitSelect()
  }

  const allSelected = notifications.length > 0 && selected.size === notifications.length

  return (
    <div className="user-profile-notif">
      <div className="user-profile-notif-head">
        <div className="user-profile-notif-head-left">
          <span className="user-profile-notif-count">
            {selectMode
              ? allAcross
                ? `모든 알림 ${selected.size}개 선택됨`
                : `${selected.size}개 선택됨`
              : unread > 0 ? `읽지 않음 ${unread}개` : '모두 읽음'}
          </span>
          {!selectMode && unread > 0 && (
            <button
              type="button"
              className="user-profile-notif-mark-all-inline"
              onClick={onMarkAllRead}
            >
              전부 읽음 처리
            </button>
          )}
        </div>
        <div className="user-profile-notif-head-actions">
          {selectMode ? (
            <>
              <button
                type="button"
                className="user-profile-notif-action-btn"
                onClick={allSelected || allAcross ? clearAcross : selectAll}
                disabled={notifications.length === 0}
              >
                {allSelected || allAcross ? '선택 해제' : '전체 선택'}
              </button>
              <button
                type="button"
                className="user-profile-notif-action-btn is-primary"
                onClick={handleBulkRead}
                disabled={selected.size === 0}
              >
                읽음 처리
              </button>
              <button
                type="button"
                className="user-profile-notif-action-btn is-danger"
                onClick={() => setDeleteConfirm(true)}
                disabled={selected.size === 0}
              >
                삭제
              </button>
              <button type="button" className="user-profile-notif-action-btn" onClick={exitSelect}>
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              className="user-profile-notif-action-btn"
              onClick={() => setSelectMode(true)}
              disabled={notifications.length === 0}
            >
              선택
            </button>
          )}
        </div>
      </div>
      {selectMode && allSelected && !allAcross && notifications.length < totalCount && (
        <div className="user-profile-notif-cross-banner">
          이 페이지 {notifications.length}개가 선택되었습니다.
          <button type="button" className="user-profile-notif-cross-link" onClick={selectAllAcross}>
            모든 알림 {totalCount}개 선택
          </button>
        </div>
      )}
      {selectMode && allAcross && (
        <div className="user-profile-notif-cross-banner is-active">
          모든 알림 {totalCount}개가 선택되었습니다.
          <button type="button" className="user-profile-notif-cross-link" onClick={clearAcross}>
            선택 해제
          </button>
        </div>
      )}
      {loading ? (
        <div className="board-placeholder">불러오는 중...</div>
      ) : notifications.length === 0 ? (
        <div className="board-placeholder">받은 알림이 없습니다</div>
      ) : (
        <ul className="user-profile-notif-list">
          {notifications.map(n => {
            const isSelected = selected.has(n.id)
            const isHighlighted = highlightId === n.id
            return (
              <li
                key={n.id}
                ref={el => {
                  if (el) itemRefs.current.set(n.id, el)
                  else itemRefs.current.delete(n.id)
                }}
                className={`user-profile-notif-item ${n.read ? '' : 'is-unread'} ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
              >
                <button
                  type="button"
                  className="user-profile-notif-btn"
                  onClick={() => selectMode ? toggle(n.id) : onItemClick(n)}
                >
                  {selectMode && (
                    <span className={`user-profile-notif-check ${isSelected ? 'is-checked' : ''}`} aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  )}
                  <div className="user-profile-notif-content">
                    <div className="user-profile-notif-row">
                      {!n.read && <span className="user-profile-notif-dot" aria-hidden="true" />}
                      <span className="user-profile-notif-kind">{NOTIF_KIND_LABEL[n.kind] || '알림'}</span>
                      <span className="user-profile-notif-title">{n.title}</span>
                    </div>
                    {n.body && <div className="user-profile-notif-body">{n.body}</div>}
                    {n.body && n.body.length > NOTIF_BODY_LONG_THRESHOLD && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="user-profile-notif-more"
                        onClick={e => { e.stopPropagation(); setDetailOf(n) }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            setDetailOf(n)
                          }
                        }}
                      >
                        자세히 보기
                      </span>
                    )}
                    <div className="user-profile-notif-time">{formatNotifTime(n.createdAt)}</div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {notifications.length > 0 && (
        <div className="user-profile-notif-pager">
          <button
            type="button"
            className="board-page-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            이전
          </button>
          <span className="user-profile-notif-page">{page} 페이지</span>
          <button
            type="button"
            className="board-page-btn"
            disabled={notifications.length < 20}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </button>
        </div>
      )}

      <ConfirmModal
        open={deleteConfirm}
        title={t('notification.deleteTitle')}
        message={t('notification.bulkDeleteConfirm', selected.size)}
        confirmLabel={t('notification.delete')}
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      {detailOf && (
        <div className="modal-backdrop" onClick={() => setDetailOf(null)}>
          <div className="modal-card user-profile-notif-modal" onClick={e => e.stopPropagation()}>
            <div className="user-profile-notif-modal-head">
              <span className="user-profile-notif-kind">{NOTIF_KIND_LABEL[detailOf.kind] || '알림'}</span>
              <span className="user-profile-notif-modal-time">{formatNotifTime(detailOf.createdAt)}</span>
            </div>
            <h2 className="user-profile-notif-modal-title">{detailOf.title}</h2>
            {detailOf.body && (
              <div className="user-profile-notif-modal-body">{detailOf.body}</div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setDetailOf(null)}>
                닫기
              </button>
              {detailOf.linkUrl && (
                <button
                  type="button"
                  className="modal-btn-primary"
                  onClick={() => {
                    const n = detailOf
                    setDetailOf(null)
                    onItemClick(n)
                  }}
                >
                  이동
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatJoinDate(iso) {
  if (!iso) return '-'
  // Server sends "YYYY-MM-DD" (visit date) or full ISO timestamp (created_at).
  // Slicing the first 10 chars avoids timezone drift for date-only values.
  const s = String(iso)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}.${m[2]}.${m[3]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '-'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

export default function UserProfile() {
  const { name } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user: me, logout } = useAuth()
  const showToast = useToast()
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState(null)
  const [sortOrder, setSortOrder] = useState(null)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountPw, setDeleteAccountPw] = useState('')
  const [deleteAccountSubmitting, setDeleteAccountSubmitting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [unsuspendConfirm, setUnsuspendConfirm] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => (
    searchParams.get('tab') === 'notifications' ? 'notifications' : 'posts'
  )) // 'posts' | 'notifications'
  const [notifications, setNotifications] = useState([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifTotal, setNotifTotal] = useState(0)
  const [notifPage, setNotifPage] = useState(1)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifFocusId, setNotifFocusId] = useState(null)
  const formatError = useApiError()

  useEffect(() => {
    setPage(1)
    setSortKey(null)
    setSortOrder(null)
    setActiveTab(searchParams.get('tab') === 'notifications' ? 'notifications' : 'posts')
    setNotifPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // If URL carries ?focus=<id>, look up which page hosts that notification
  // and pivot notifPage there. Also preserve the id so we can scroll to it
  // after the list renders.
  useEffect(() => {
    const focusIdRaw = searchParams.get('focus')
    if (!focusIdRaw) return
    const focusId = Number(focusIdRaw)
    if (!Number.isSafeInteger(focusId) || focusId <= 0) return
    let cancelled = false
    fetchNotificationPage(focusId, { pageSize: 20 })
      .then(({ page }) => {
        if (cancelled) return
        setNotifFocusId(focusId)
        setNotifPage(page || 1)
        // Drop the focus param so refresh/back doesn't keep re-scrolling.
        const next = new URLSearchParams(searchParams)
        next.delete('focus')
        setSearchParams(next, { replace: true })
      })
      .catch(() => { /* notification might have been deleted — ignore */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('focus')])

  // Fetch my notifications whenever the notifications tab is active.
  // Only visible on own profile, so re-fetch is scoped to (isMe, tab, page).
  useEffect(() => {
    if (activeTab !== 'notifications') return
    if (!me || !profile || me.name !== profile.name) return
    let cancelled = false
    setNotifLoading(true)
    fetchNotifications({ page: notifPage, pageSize: 20 })
      .then(data => {
        if (cancelled) return
        setNotifications(data.notifications)
        setNotifUnread(data.unreadCount)
        setNotifTotal(data.totalCount ?? data.notifications.length)
      })
      .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
      .finally(() => { if (!cancelled) setNotifLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notifPage, me?.id, profile?.id])

  function handleSortChange(key, order) {
    setSortKey(key)
    setSortOrder(order)
    setPage(1)
  }


  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setProfileError(null)
    fetchUser(name)
      .then(({ user }) => { if (!cancelled) setProfile(user) })
      .catch(err => { if (!cancelled) setProfileError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [name])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    fetchUserPosts(name, { page, pageSize: PAGE_SIZE, sort: sortKey, order: sortOrder })
      .then(data => {
        if (cancelled) return
        setPosts(data.posts)
        setTotalPages(data.totalPages)
      })
      .catch(() => {
        if (cancelled) return
        setPosts([])
        setTotalPages(1)
      })
    return () => { cancelled = true }
  }, [name, page, profile, sortKey, sortOrder])

  if (loading) {
    return (
      <div className="user-profile">
        <div className="board-placeholder">{t('common.loading')}</div>
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <div className="user-profile">
        <div className="board-placeholder">{t('profile.notFound')}</div>
      </div>
    )
  }

  const isMe = me && me.name === profile.name

  function confirmLogout() {
    setLogoutConfirm(false)
    logout()
    showToast(t('login.loggedOut'), 'success')
  }

  function closeDeleteAccount() {
    setDeleteAccountOpen(false)
    setDeleteAccountPw('')
    setDeleteAccountSubmitting(false)
  }

  async function confirmDeleteAccount() {
    if (!deleteAccountPw || deleteAccountSubmitting) return
    setDeleteAccountSubmitting(true)
    try {
      await deleteAccount({ password: deleteAccountPw })
      closeDeleteAccount()
      logout()
      showToast(t('profile.deleteAccountDone'), 'success')
      navigate('/')
    } catch (err) {
      setDeleteAccountSubmitting(false)
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  async function handleShare() {
    const ok = await copyToClipboard(window.location.href)
    if (ok) showToast(t('community.shareCopied'), 'success')
    else showToast(t('community.shareFailed'), 'error')
  }

  async function submitSuspend() {
    const reason = suspendReason.trim()
    if (!reason) return
    try {
      await suspendUser(profile.id, { reason })
      setSuspendOpen(false)
      setSuspendReason('')
      setProfile(p => p ? { ...p, suspended: true, suspendReason: reason } : p)
      showToast('정지되었습니다', 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  async function submitUnsuspend() {
    try {
      await unsuspendUser(profile.id)
      setUnsuspendConfirm(false)
      setProfile(p => p ? { ...p, suspended: false, suspendReason: null } : p)
      showToast('정지 해제되었습니다', 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  async function submitAppeal({ message, imageUrls }) {
    try {
      await submitInquiry({ kind: 'suspension_appeal', message, imageUrls })
      setInquiryOpen(false)
      showToast(t('inquiry.done'), 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  function handleSaved(next) {
    setEditOpen(false)
    if (next.name !== profile.name) {
      // Nickname changed → URL is now stale; navigate to new path.
      navigate(`/user/${encodeURIComponent(next.name)}`, { replace: true })
      return
    }
    setProfile(p => p ? { ...p, avatarUrl: next.avatarUrl, bio: next.bio } : p)
  }

  const isAdminViewer = me && (me.role === 'admin' || me.role === 'mod')
  const canSuspend = isAdminViewer && !isMe && !profile.suspended
  // After purge (30d elapsed), there's nothing to restore — hide unsuspend button.
  const canUnsuspend = isAdminViewer && profile.suspended && !profile.dataPurged
  const daysLeft = profile.suspended && profile.suspendedAt
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(profile.suspendedAt).getTime()) / 86400000))
    : null

  return (
    <div className="user-profile">
      {profile.suspended && isMe && !profile.dataPurged && (
        <div className="user-profile-suspended-banner user-profile-suspended-self">
          <div>
            <strong>{t('profile.suspendedBannerTitle')}</strong>
            {profile.suspendReason && <span className="user-profile-suspend-reason"> · {profile.suspendReason}</span>}
            <div className="user-profile-suspend-hint">
              {t('profile.suspendHint')}
              {daysLeft !== null && (
                <> · {t('profile.purgeCountdownPre')} <strong>{t('profile.purgeCountdownValue', daysLeft)}</strong></>
              )}
            </div>
          </div>
          <button
            type="button"
            className="user-profile-inquiry-btn"
            onClick={() => setInquiryOpen(true)}
          >
            {t('profile.inquiryButton')}
          </button>
        </div>
      )}
      {profile.suspended && !isMe && (
        <div className="user-profile-suspended-banner">
          <strong>{profile.dataPurged ? t('profile.dataPurged') : t('profile.suspendedAccount')}</strong>
          {profile.suspendReason && <span className="user-profile-suspend-reason"> · {profile.suspendReason}</span>}
          {!profile.dataPurged && daysLeft !== null && (
            <span className="user-profile-suspend-reason"> · {t('profile.dataRetentionCountdown', daysLeft)}</span>
          )}
        </div>
      )}
      <header className="user-profile-header">
        <div className="user-profile-menu">
          <AuthorMenu onShare={handleShare} />
        </div>
        <img src={avatarOf(profile.avatarUrl)} alt="" className="user-profile-avatar" />
        <div className="user-profile-info">
          <div className="user-profile-name-row">
            <h1 className="user-profile-name">
              <UserTierBadge tier={profile.tier} />
              {profile.name}
            </h1>
            {isMe && (
              <button
                type="button"
                className="user-profile-edit-btn"
                onClick={() => setEditOpen(true)}
              >
                {t('profile.edit')}
              </button>
            )}
            {canSuspend && (
              <button
                type="button"
                className="user-profile-suspend-btn"
                onClick={() => setSuspendOpen(true)}
              >
                유저 정지
              </button>
            )}
            {canUnsuspend && (
              <button
                type="button"
                className="user-profile-unsuspend-btn"
                onClick={() => setUnsuspendConfirm(true)}
              >
                정지 해제
              </button>
            )}
          </div>
          <div className="user-profile-meta">
            <span>{t('profile.joinedAt', formatJoinDate(profile.createdAt))}</span>
          </div>
          {profile.bio && <p className="user-profile-bio">{profile.bio}</p>}
        </div>
        {isMe && (
          <div className="user-profile-account-actions">
            <button
              type="button"
              className="user-profile-delete-account"
              onClick={() => setDeleteAccountOpen(true)}
            >
              {t('profile.deleteAccount')}
            </button>
            <button
              type="button"
              className="user-profile-logout"
              onClick={() => setLogoutConfirm(true)}
            >
              {t('login.logout')}
            </button>
          </div>
        )}
      </header>

      <ConfirmModal
        open={logoutConfirm}
        title={t('login.logout')}
        message={t('profile.logoutConfirm')}
        confirmLabel={t('login.logout')}
        variant="danger"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutConfirm(false)}
      />

      {deleteAccountOpen && (
        <div className="modal-backdrop" onClick={closeDeleteAccount}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{t('profile.deleteAccountTitle')}</h2>
            <p className="modal-body">
              {t('profile.deleteAccountWarningPre')}
              <strong>{t('profile.deleteAccountWarningStrong')}</strong>
              {t('profile.deleteAccountWarningPost')}
            </p>
            <div className="modal-form">
              <label className="modal-field">
                <span className="modal-field-label">{t('profile.currentPassword')}</span>
                <PasswordInput
                  className="modal-input"
                  value={deleteAccountPw}
                  onChange={e => setDeleteAccountPw(e.target.value)}
                  disabled={deleteAccountSubmitting}
                  autoComplete="current-password"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={closeDeleteAccount}
                disabled={deleteAccountSubmitting}
              >
                {t('profile.cancel')}
              </button>
              <button
                type="button"
                className="modal-btn-danger"
                onClick={confirmDeleteAccount}
                disabled={deleteAccountSubmitting || !deleteAccountPw}
              >
                {deleteAccountSubmitting ? t('profile.deleteAccountSubmitting') : t('profile.deleteAccountSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {suspendOpen && (
        <div className="modal-backdrop" onClick={() => setSuspendOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">유저 정지</h2>
            <p className="modal-body">
              <strong>{profile.name}</strong> 계정을 정지합니다. 정지 사유를 입력해주세요.
              정지된 계정은 로그인 불가 · 이메일/닉네임 재가입 차단됩니다.
            </p>
            <div className="modal-form">
              <label className="modal-field">
                <span className="modal-field-label">정지 사유</span>
                <textarea
                  className="modal-input modal-textarea"
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="예: 커뮤니티 규칙 위반"
                  maxLength={500}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setSuspendOpen(false)}>
                {t('community.action.cancel')}
              </button>
              <button
                type="button"
                className="modal-btn-danger"
                onClick={submitSuspend}
                disabled={!suspendReason.trim()}
              >
                정지
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={unsuspendConfirm}
        title="정지 해제"
        message={`${profile.name} 계정의 정지를 해제합니다. 계속하시겠습니까?`}
        confirmLabel="정지 해제"
        onConfirm={submitUnsuspend}
        onCancel={() => setUnsuspendConfirm(false)}
      />

      <InquiryModal
        open={inquiryOpen}
        title={t('profile.appealTitle')}
        subtitle={`${profile.suspendReason ? t('profile.appealReasonLabel', profile.suspendReason) + ' ' : ''}${t('profile.appealSubtitle')}`}
        onConfirm={submitAppeal}
        onCancel={() => setInquiryOpen(false)}
      />

      <section className="user-profile-section">
        <div className="user-profile-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'posts'}
            className={`user-profile-tab ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('posts')
              setSearchParams({}, { replace: true })
            }}
          >
            {t('profile.posts')}
            <span className="user-profile-tab-count">({profile.postCount})</span>
          </button>
          {isMe && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'notifications'}
              className={`user-profile-tab ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('notifications')
                setSearchParams({ tab: 'notifications' }, { replace: true })
              }}
            >
              알림
              {notifUnread > 0 && (
                <span className="user-profile-tab-count">({notifUnread})</span>
              )}
            </button>
          )}
          <div className="user-profile-stats">
            <span className="user-profile-stat">
              <span className="user-profile-stat-label">{t('profile.commentCount')}</span>
              <span className="user-profile-stat-value">{profile.commentCount ?? 0}</span>
            </span>
            <span className="user-profile-stat">
              <span className="user-profile-stat-label">{t('profile.visitCount')}</span>
              <span className="user-profile-stat-value">{profile.visitCount ?? 0}</span>
            </span>
            <span className="user-profile-stat">
              <span className="user-profile-stat-label">{t('profile.lastVisit')}</span>
              <span className="user-profile-stat-value">
                {profile.lastVisitDate ? formatJoinDate(profile.lastVisitDate) : '-'}
              </span>
            </span>
          </div>
        </div>

        {activeTab === 'posts' ? (
          <>
            {posts.length === 0 ? (
              <div className="board-placeholder">{t('common.empty')}</div>
            ) : (
              <PostListView
                posts={posts}
                showBoard={true}
                sort={{ key: sortKey, order: sortOrder, onChange: handleSortChange }}
              />
            )}
            {totalPages > 1 && (
              <div className="user-profile-pagination">
                <BoardPagination
                  currentPage={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        ) : (
          <NotificationsPanel
            notifications={notifications}
            unread={notifUnread}
            loading={notifLoading}
            page={notifPage}
            onPageChange={setNotifPage}
            focusId={notifFocusId}
            onFocusHandled={() => setNotifFocusId(null)}
            onItemClick={async n => {
              if (!n.read) {
                try {
                  await markRead(n.id)
                  setNotifUnread(c => Math.max(0, c - 1))
                  setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
                } catch { /* ignore */ }
              }
              if (n.linkUrl) {
                if (/^https?:\/\//i.test(n.linkUrl)) window.open(n.linkUrl, '_blank', 'noopener,noreferrer')
                else navigate(n.linkUrl)
              }
            }}
            onBulkRead={async (ids) => {
              // Refetch after server ops so unread-count / total / list stay in
              // sync even when selection spans pages.
              try {
                await Promise.all(ids.map(id => markRead(id)))
                const data = await fetchNotifications({ page: notifPage, pageSize: 20 })
                setNotifications(data.notifications)
                setNotifUnread(data.unreadCount)
                setNotifTotal(data.totalCount ?? data.notifications.length)
              } catch { /* ignore */ }
            }}
            onBulkDelete={async (ids) => {
              try {
                await Promise.all(ids.map(id => deleteNotification(id)))
                const data = await fetchNotifications({ page: notifPage, pageSize: 20 })
                setNotifications(data.notifications)
                setNotifUnread(data.unreadCount)
                setNotifTotal(data.totalCount ?? data.notifications.length)
                // If this page became empty and we aren't on page 1, step back.
                if (data.notifications.length === 0 && notifPage > 1) {
                  setNotifPage(p => Math.max(1, p - 1))
                }
              } catch { /* ignore */ }
            }}
            onMarkAllRead={async () => {
              try {
                await markAllRead()
                const data = await fetchNotifications({ page: notifPage, pageSize: 20 })
                setNotifications(data.notifications)
                setNotifUnread(data.unreadCount)
                setNotifTotal(data.totalCount ?? data.notifications.length)
              } catch { /* ignore */ }
            }}
            totalCount={notifTotal}
          />
        )}
      </section>

      <ProfileEditModal
        open={editOpen}
        onSaved={handleSaved}
        onCancel={() => setEditOpen(false)}
      />
    </div>
  )
}

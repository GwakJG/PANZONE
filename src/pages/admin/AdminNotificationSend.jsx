import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import BoardPagination from '../../components/community/BoardPagination'
import UserTierBadge from '../../components/UserTierBadge'
import ConfirmModal from '../../components/ConfirmModal'
import { avatarOf } from '../../utils/avatar'
import {
  fetchAdminUsers,
  sendNotification,
  sendNotificationsBulk,
  broadcastNotificationToAll,
  fetchNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
} from '../../services/adminApi'

const PAGE_SIZE_OPTIONS = [20, 40, 60, 100]
const TIER_FILTER_OPTIONS = [
  { value: 'all', labelKey: null, label: '전체' },
  { value: '0', labelKey: 'tier.tier0' },
  { value: '1', labelKey: 'tier.tier1' },
  { value: '2', labelKey: 'tier.tier2' },
  { value: '3', labelKey: 'tier.tier3' },
  { value: '4', labelKey: 'tier.tier4' },
  { value: 'suspended', labelKey: null, label: '정지' },
]

// =====================================================================
// Shared send modal: dropdown of templates + title + body
// =====================================================================

function SendModal({ open, target, templates, onCancel, onSend, submitting }) {
  // Remount on open so internal state (title/body/templateId) always starts fresh.
  return open ? (
    <SendModalInner
      key="open"
      target={target}
      templates={templates}
      onCancel={onCancel}
      onSend={onSend}
      submitting={submitting}
    />
  ) : null
}

function SendModalInner({ target, templates, onCancel, onSend, submitting }) {
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleTemplateChange(e) {
    const id = e.target.value
    setTemplateId(id)
    if (!id) return
    const t = templates.find(x => String(x.id) === String(id))
    if (t) {
      setTitle(t.title)
      setBody(t.body)
    }
  }

  function handleSubmit() {
    if (!title.trim()) return
    onSend({ title: title.trim(), body: body.trim() || null })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card admin-notif-send-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">알림 전송</h2>
        <p className="modal-body">{target}</p>

        <div className="modal-form">
          <label className="modal-field">
            <span className="modal-field-label">자주하는 답변</span>
            <select
              className="admin-select"
              value={templateId}
              onChange={handleTemplateChange}
            >
              <option value="">— 직접 입력 —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>

          <label className="modal-field">
            <span className="modal-field-label">제목</span>
            <input
              type="text"
              className="modal-input"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 200))}
              placeholder="알림 제목"
              maxLength={200}
            />
          </label>

          <label className="modal-field">
            <span className="modal-field-label">본문</span>
            <textarea
              className="modal-input modal-textarea"
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 1000))}
              rows={5}
              placeholder="알림 본문 (선택)"
              maxLength={1000}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="modal-btn-primary"
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
          >
            {submitting ? '전송 중...' : '전송'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Template editor modal — shared for create / edit
// =====================================================================

function TemplateEditModal({ open, initial, onCancel, onSave, submitting }) {
  // Remount on open so the initial title/body load cleanly into state.
  return open ? (
    <TemplateEditModalInner
      key={initial?.id ?? 'new'}
      initial={initial}
      onCancel={onCancel}
      onSave={onSave}
      submitting={submitting}
    />
  ) : null
}

function TemplateEditModalInner({ initial, onCancel, onSave, submitting }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [body, setBody] = useState(initial?.body || '')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card admin-notif-template-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{initial ? '답변 수정' : '새 답변'}</h2>
        <div className="modal-form">
          <label className="modal-field">
            <span className="modal-field-label">제목</span>
            <input
              type="text"
              className="modal-input"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 200))}
              placeholder="답변 제목"
              maxLength={200}
            />
          </label>
          <label className="modal-field">
            <span className="modal-field-label">내용</span>
            <textarea
              className="modal-input modal-textarea"
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 1000))}
              rows={6}
              placeholder="답변 내용"
              maxLength={1000}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="modal-btn-primary"
            onClick={() => onSave({ title: title.trim(), body: body.trim() })}
            disabled={!title.trim() || !body.trim() || submitting}
          >
            {initial ? '저장' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Users tab
// =====================================================================

function UsersTab({ templates, onSendSingle, onSendBulk, onBroadcast, submitting }) {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()

  const [tierFilter, setTierFilter] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sendTarget, setSendTarget] = useState(null) // { mode, ids, label }

  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [tierFilter, pageSize, searchQuery])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAdminUsers({ page, pageSize, tier: tierFilter, q: searchQuery })
      .then(data => {
        if (cancelled) return
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, tierFilter, searchQuery])

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSendSingleClick(user) {
    setSendTarget({ mode: 'single', ids: [user.id], label: `${user.name} 에게 발송` })
  }

  function handleBulkClick() {
    if (selectedIds.size === 0) {
      showToast('먼저 유저를 선택해주세요', 'error')
      return
    }
    setSendTarget({ mode: 'bulk', ids: Array.from(selectedIds), label: `선택한 ${selectedIds.size}명에게 발송` })
  }

  const filterActive = tierFilter !== 'all' || searchQuery.trim() !== ''

  function handleBroadcastClick() {
    const label = filterActive
      ? `현재 필터에 해당하는 ${total.toLocaleString()}명에게 발송`
      : `가입한 모든 유저 ${total.toLocaleString()}명에게 발송 (관리자/정지 제외)`
    setSendTarget({
      mode: 'broadcast',
      ids: null,
      label,
      filter: filterActive ? { tier: tierFilter, q: searchQuery } : null,
    })
  }

  async function handleSend({ title, body }) {
    if (!sendTarget) return
    try {
      if (sendTarget.mode === 'single') {
        await onSendSingle({ userId: sendTarget.ids[0], title, body })
      } else if (sendTarget.mode === 'bulk') {
        await onSendBulk({ userIds: sendTarget.ids, title, body })
        setSelectedIds(new Set())
      } else if (sendTarget.mode === 'broadcast') {
        await onBroadcast({ title, body, filter: sendTarget.filter })
      }
      setSendTarget(null)
    } catch { /* handled by parent via toast */ }
  }

  return (
    <div>
      <div className="admin-users-controls">
        <label className="admin-field admin-users-search">
          <span className="admin-field-label">검색</span>
          <input
            type="text"
            className="admin-select admin-users-search-input"
            placeholder="닉네임 또는 이메일"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </label>

        <label className="admin-field">
          <span className="admin-field-label">등급 필터</span>
          <select
            className="admin-select"
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
          >
            {TIER_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.labelKey ? t(opt.labelKey) : opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span className="admin-field-label">페이지당</span>
          <select
            className="admin-select"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </label>

        <div className="admin-users-total">
          전체 <strong>{total.toLocaleString()}</strong>명
        </div>

        <div className="admin-notif-send-top-actions">
          <button
            type="button"
            className="admin-featured-row-btn"
            onClick={handleBulkClick}
            disabled={selectedIds.size === 0}
          >
            다중 전송 ({selectedIds.size})
          </button>
          <button
            type="button"
            className="admin-featured-row-btn is-primary"
            onClick={handleBroadcastClick}
          >
            {filterActive
              ? `필터 전체 전송 (${total.toLocaleString()}명)`
              : `전체 전송 (${total.toLocaleString()}명)`}
          </button>
        </div>
      </div>

      <div className="admin-users-table-wrap">
        <table className="board-list-table admin-users-table">
          <thead>
            <tr>
              <th className="col-check"></th>
              <th className="col-avatar"></th>
              <th className="col-name">닉네임</th>
              <th className="col-email">이메일</th>
              <th className="col-tier">등급</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="admin-users-placeholder">{t('common.loading')}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="admin-users-placeholder">{t('common.empty')}</td></tr>
            ) : (
              users.map(u => {
                const pinned = !u.suspended && (u.role === 'admin' || u.role === 'mod')
                const checked = selectedIds.has(u.id)
                return (
                  <tr
                    key={u.id}
                    className={`${pinned ? 'admin-users-row-pinned' : ''} ${u.suspended ? 'admin-users-row-suspended' : ''}`}
                  >
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(u.id)}
                      />
                    </td>
                    <td className="col-avatar">
                      <img src={avatarOf(u.avatarUrl)} alt="" className="admin-users-avatar" />
                    </td>
                    <td className="col-name">
                      <Link to={`/user/${encodeURIComponent(u.name)}`} className="admin-users-name">
                        <UserTierBadge tier={u.tier} />
                        {u.name}
                      </Link>
                    </td>
                    <td className="col-email">{u.email}</td>
                    <td className="col-tier">
                      {u.suspended ? <span className="admin-users-suspended-label">정지</span> : t(`tier.tier${u.tier}`)}
                    </td>
                    <td className="col-action">
                      <button
                        type="button"
                        className="admin-featured-row-btn"
                        onClick={() => handleSendSingleClick(u)}
                      >
                        전송
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-users-pagination">
          <BoardPagination currentPage={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <SendModal
        open={!!sendTarget}
        target={sendTarget?.label || ''}
        templates={templates}
        onCancel={() => setSendTarget(null)}
        onSend={handleSend}
        submitting={submitting}
      />
    </div>
  )
}

// =====================================================================
// Templates tab
// =====================================================================

function TemplatesTab() {
  const showToast = useToast()
  const formatError = useApiError()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(null) // null → create, object → edit
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const { templates } = await fetchNotificationTemplates()
      setTemplates(templates)
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave({ title, body }) {
    try {
      setSubmitting(true)
      if (editing) {
        await updateNotificationTemplate(editing.id, { title, body })
        showToast('수정했습니다', 'success')
      } else {
        await createNotificationTemplate({ title, body })
        showToast('생성했습니다', 'success')
      }
      setEditOpen(false)
      setEditing(null)
      reload()
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    const t = deleteTarget
    setDeleteTarget(null)
    if (!t) return
    try {
      await deleteNotificationTemplate(t.id)
      showToast('삭제했습니다', 'success')
      reload()
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  return (
    <div>
      <div className="admin-notif-template-head">
        <div className="admin-notif-template-count">
          총 {templates.length}개
        </div>
        <button
          type="button"
          className="modal-btn-primary"
          onClick={() => { setEditing(null); setEditOpen(true) }}
        >
          + 새 답변 만들기
        </button>
      </div>

      <div className="admin-notif-template-list">
        {loading ? (
          <div className="admin-users-placeholder">불러오는 중...</div>
        ) : templates.length === 0 ? (
          <div className="admin-users-placeholder">저장된 답변이 없습니다</div>
        ) : (
          templates.map(t => (
            <div key={t.id} className="admin-notif-template-item">
              <div className="admin-notif-template-main">
                <div className="admin-notif-template-title">{t.title}</div>
                <div className="admin-notif-template-body">{t.body}</div>
              </div>
              <div className="admin-notif-template-actions">
                <button
                  type="button"
                  className="admin-featured-row-btn"
                  onClick={() => { setEditing(t); setEditOpen(true) }}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="admin-featured-row-btn is-danger"
                  onClick={() => setDeleteTarget(t)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <TemplateEditModal
        open={editOpen}
        initial={editing}
        onCancel={() => { setEditOpen(false); setEditing(null) }}
        onSave={handleSave}
        submitting={submitting}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="답변 삭제"
        message="이 자주하는 답변을 삭제합니다. 되돌릴 수 없어요."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// =====================================================================
// Main page
// =====================================================================

export default function AdminNotificationSend() {
  const showToast = useToast()
  const formatError = useApiError()
  const [activeTab, setActiveTab] = useState('users') // 'users' | 'templates'
  const [templates, setTemplates] = useState([])
  const [sending, setSending] = useState(false)

  // Keep a local copy of templates for the send modal's dropdown.
  useEffect(() => {
    let cancelled = false
    fetchNotificationTemplates()
      .then(({ templates }) => { if (!cancelled) setTemplates(templates) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [activeTab])

  const successToast = useMemo(() => (count) => `${count}명에게 알림을 전송했습니다`, [])

  async function handleSendSingle({ userId, title, body }) {
    setSending(true)
    try {
      await sendNotification({ userId, title, body })
      showToast('알림을 전송했습니다', 'success')
    } catch (err) {
      showToast(formatError(err), 'error')
      throw err
    } finally {
      setSending(false)
    }
  }

  async function handleSendBulk({ userIds, title, body }) {
    setSending(true)
    try {
      const { count } = await sendNotificationsBulk({ userIds, title, body })
      showToast(successToast(count), 'success')
    } catch (err) {
      showToast(formatError(err), 'error')
      throw err
    } finally {
      setSending(false)
    }
  }

  async function handleBroadcast({ title, body, filter }) {
    setSending(true)
    try {
      const { count } = await broadcastNotificationToAll({ title, body, filter })
      showToast(successToast(count), 'success')
    } catch (err) {
      showToast(formatError(err), 'error')
      throw err
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">알림 전송</h1>
      <p className="admin-page-lead">
        특정 유저 또는 전체 유저에게 인앱 알림을 발송합니다. 자주 쓰는 답변은 템플릿으로 저장해두고 재사용하세요.
      </p>

      <div className="admin-featured-tabs">
        <button
          type="button"
          className={`admin-featured-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          유저
        </button>
        <button
          type="button"
          className={`admin-featured-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          자주하는 답변
        </button>
      </div>

      {activeTab === 'users' ? (
        <UsersTab
          templates={templates}
          onSendSingle={handleSendSingle}
          onSendBulk={handleSendBulk}
          onBroadcast={handleBroadcast}
          submitting={sending}
        />
      ) : (
        <TemplatesTab />
      )}
    </div>
  )
}

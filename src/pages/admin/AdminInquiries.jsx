import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import BoardPagination from '../../components/community/BoardPagination'
import ConfirmModal from '../../components/ConfirmModal'
import { avatarOf } from '../../utils/avatar'
import {
  fetchAdminInquiries,
  resolveInquiry,
  reopenInquiry,
  updateInquiryMemo,
  fetchNotificationTemplates,
} from '../../services/adminApi'

const PAGE_SIZE_OPTIONS = [20, 40, 60, 100]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '미답변' },
  { value: 'resolved', label: '답변완료' },
]

const KIND_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'suspension_appeal', label: '정지 이의' },
  { value: 'general', label: '일반' },
]

const KIND_LABEL = {
  suspension_appeal: '정지 이의',
  general: '일반',
}

const ACTION_LABEL = {
  unsuspend: '정지 해제',
  reject_appeal: '기각',
  reply: '답변',
  close_unanswered: '미답변 종료',
}

const MEMO_MAX = 1000
const MESSAGE_MAX = 1000

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// Action → default template. {name} substituted with the inquirer's nickname.
// reply + close_unanswered start blank (admin writes free-form).
const MESSAGE_TEMPLATES = {
  unsuspend: '{name}님의 계정 정지 해제 요청을 검토한 결과, 해제되었습니다. 다시 활동하실 수 있습니다.',
  reject_appeal: '{name}님의 이의 신청을 검토한 결과, 정지 사유에 해당하여 기각되었습니다. 추가 문의는 운영팀으로 연락해 주세요.',
  reply: '',
  close_unanswered: '',
}

// Action options available for a given inquiry kind.
function actionsForKind(kind) {
  if (kind === 'suspension_appeal') {
    return [
      { value: 'unsuspend', label: '정지 해제 + 답변' },
      { value: 'reject_appeal', label: '기각 + 답변' },
    ]
  }
  return [
    { value: 'reply', label: '답변' },
    { value: 'close_unanswered', label: '미답변 종료' },
  ]
}

function renderTemplate(action, inquiry) {
  const tpl = MESSAGE_TEMPLATES[action] || ''
  const name = inquiry?.user?.name || '회원'
  return tpl.replace(/\{name\}/g, name)
}

// Full-inquiry detail modal — shows kind, full message, attachments.
function DetailModal({ open, inquiry, onClose }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !inquiry) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">문의 상세</h2>
        <div className="admin-report-detail">
          <div className="admin-report-detail-section">
            <div className="admin-report-detail-label">종류</div>
            <span className={`admin-inquiry-kind-badge admin-inquiry-kind-${inquiry.kind}`}>
              {KIND_LABEL[inquiry.kind] || inquiry.kind}
            </span>
          </div>

          {inquiry.user && (
            <div className="admin-report-detail-section">
              <div className="admin-report-detail-label">신청자</div>
              <div className="admin-inquiry-user-row">
                <img src={avatarOf(inquiry.user.avatarUrl)} alt="" className="admin-users-avatar" />
                <div>
                  <div>{inquiry.user.name}{inquiry.user.suspended && <span className="admin-report-flag admin-report-flag-suspended">정지</span>}</div>
                  <div className="admin-report-muted">{inquiry.user.email}</div>
                </div>
              </div>
            </div>
          )}

          <div className="admin-report-detail-section">
            <div className="admin-report-detail-label">문의 내용</div>
            <div className="admin-report-detail-text">{inquiry.message}</div>
          </div>

          {inquiry.imageUrls.length > 0 && (
            <div className="admin-report-detail-section">
              <div className="admin-report-detail-label">첨부 이미지 ({inquiry.imageUrls.length})</div>
              <div className="admin-report-detail-images">
                {inquiry.imageUrls.map((url, i) => (
                  <a
                    key={url + i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-report-detail-image"
                  >
                    <img src={url} alt={`attachment ${i + 1}`} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {inquiry.resolveNote && (
            <div className="admin-report-detail-section">
              <div className="admin-report-detail-label">
                답변 ({ACTION_LABEL[inquiry.resolveAction] || ''}
                {inquiry.resolverName && ` · ${inquiry.resolverName}`})
              </div>
              <div className="admin-report-detail-text">{inquiry.resolveNote}</div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

// Answer/resolve modal with kind-dependent action radios + template dropdown.
function ResolveModal({ open, inquiry, templates, onConfirm, onCancel }) {
  const availableActions = inquiry ? actionsForKind(inquiry.kind) : []
  const [action, setAction] = useState(availableActions[0]?.value || 'reply')
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !inquiry) return
    const first = actionsForKind(inquiry.kind)[0]?.value
    setAction(first)
    setMessage(renderTemplate(first, inquiry))
    setEdited(false)
    setSubmitting(false)
  }, [open, inquiry])

  useEffect(() => {
    if (!open || !inquiry || edited) return
    setMessage(renderTemplate(action, inquiry))
  }, [action, open, inquiry, edited])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open || !inquiry) return null

  const isCloseUnanswered = action === 'close_unanswered'
  const canSubmit = !submitting && (isCloseUnanswered || !!message.trim())

  function applyTemplate(id) {
    const tpl = templates.find(t => String(t.id) === String(id))
    if (!tpl) return
    setMessage(tpl.body || '')
    setEdited(true)
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onConfirm({
        action,
        message: isCloseUnanswered ? undefined : message.trim(),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">
          문의 처리
          <span className={`admin-inquiry-kind-badge admin-inquiry-kind-${inquiry.kind} modal-title-badge`}>
            {KIND_LABEL[inquiry.kind]}
          </span>
        </h2>
        <p className="modal-body">
          {inquiry.kind === 'suspension_appeal'
            ? '정지 해제를 선택하면 이 모달에서 바로 유저 계정이 해제됩니다.'
            : '답변 메시지는 신청자에게 알림으로 전송됩니다.'}
        </p>
        <div className="modal-form">
          <div className="modal-field">
            <span className="modal-field-label">처리 결과</span>
            <div className="admin-resolve-options">
              {availableActions.map(opt => (
                <label
                  key={opt.value}
                  className={`admin-resolve-option ${action === opt.value ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="inquiry-action"
                    value={opt.value}
                    checked={action === opt.value}
                    onChange={() => setAction(opt.value)}
                    disabled={submitting}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {!isCloseUnanswered && (
            <>
              {templates.length > 0 && (
                <div className="modal-field">
                  <span className="modal-field-label">
                    자주하는 답변
                    <span className="report-details-hint">(선택 시 메시지에 채워짐)</span>
                  </span>
                  <select
                    className="modal-input"
                    value=""
                    onChange={e => { applyTemplate(e.target.value); e.target.value = '' }}
                    disabled={submitting}
                  >
                    <option value="">-- 템플릿 선택 --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <label className="modal-field">
                <span className="modal-field-label">
                  답변 메시지
                  <span className="report-details-hint">
                    ({inquiry.user?.name || '신청자'}에게 · {message.length}/{MESSAGE_MAX})
                  </span>
                </span>
                <textarea
                  className="modal-input modal-textarea"
                  value={message}
                  onChange={e => { setMessage(e.target.value.slice(0, MESSAGE_MAX)); setEdited(true) }}
                  rows={6}
                  disabled={submitting}
                />
              </label>
            </>
          )}

          {isCloseUnanswered && (
            <p className="admin-inquiry-close-hint">
              신청자에게 알림을 보내지 않고 티켓만 닫습니다.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="modal-btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {submitting ? '처리 중…' : '처리 완료'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Read-only modal for full admin memo (비고).
function MemoDetailModal({ open, memo, onClose }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">비고</h2>
        <div className="admin-report-memo-full">
          {memo || <span className="admin-report-memo-empty">(내용 없음)</span>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function MemoCell({ inquiry, onSaved, onError, onOpenDetail }) {
  const initial = inquiry.adminMemo || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => { if (editing) textareaRef.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(initial) }, [initial, editing])

  async function save() {
    if (saving) return
    if (draft === initial) { setEditing(false); return }
    setSaving(true)
    try {
      await updateInquiryMemo(inquiry.id, draft)
      onSaved(inquiry.id, draft)
      setEditing(false)
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(initial)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="admin-report-memo admin-report-memo-editing">
        <textarea
          ref={textareaRef}
          className="admin-report-memo-input"
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, MEMO_MAX))}
          rows={3}
          disabled={saving}
          placeholder="관리자끼리만 보이는 메모"
        />
        <div className="admin-report-memo-actions">
          <button type="button" className="admin-report-memo-cancel" onClick={cancel} disabled={saving}>
            취소
          </button>
          <button type="button" className="admin-report-memo-save" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-report-memo">
      {initial ? (
        <div className="admin-report-memo-text" title={initial}>{initial}</div>
      ) : (
        <div className="admin-report-memo-empty">메모 없음</div>
      )}
      <div className="admin-report-memo-btn-row">
        <button
          type="button"
          className="admin-report-memo-edit"
          onClick={() => setEditing(true)}
        >
          {initial ? '수정' : '메모 추가'}
        </button>
        {initial && (
          <button
            type="button"
            className="admin-report-memo-detail"
            onClick={() => onOpenDetail(initial)}
          >
            자세히 보기
          </button>
        )}
      </div>
    </div>
  )
}

export default function AdminInquiries() {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()

  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [inquiries, setInquiries] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const [templates, setTemplates] = useState([])

  const [resolveTarget, setResolveTarget] = useState(null)
  const [reopenTarget, setReopenTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [memoDetailText, setMemoDetailText] = useState(null)

  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [statusFilter, kindFilter, pageSize, searchQuery])

  useEffect(() => {
    fetchNotificationTemplates()
      .then(data => setTemplates(data.templates || []))
      .catch(() => { /* templates are optional */ })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAdminInquiries({
      page,
      pageSize,
      status: statusFilter,
      kind: kindFilter === 'all' ? undefined : kindFilter,
      q: searchQuery,
    })
      .then(data => {
        if (cancelled) return
        setInquiries(data.inquiries)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(err => {
        if (cancelled) return
        showToast(formatError(err), 'error')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter, kindFilter, searchQuery, reloadKey])

  async function handleResolve({ action, message }) {
    const r = resolveTarget
    if (!r) return
    try {
      await resolveInquiry(r.id, { action, message })
      showToast('처리 완료', 'success')
      setResolveTarget(null)
      setReloadKey(k => k + 1)
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  async function handleReopen() {
    const r = reopenTarget
    if (!r) return
    try {
      await reopenInquiry(r.id)
      showToast('미답변으로 되돌렸습니다', 'success')
      setReopenTarget(null)
      setReloadKey(k => k + 1)
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">문의 알림</h1>

      <div className="admin-users-controls">
        <label className="admin-field admin-users-search">
          <span className="admin-field-label">검색</span>
          <input
            type="text"
            className="admin-select admin-users-search-input"
            placeholder="닉네임·이메일·내용"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </label>

        <label className="admin-field">
          <span className="admin-field-label">상태</span>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span className="admin-field-label">종류</span>
          <select
            className="admin-select"
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
          >
            {KIND_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
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
          전체 <strong>{total.toLocaleString()}</strong>건
        </div>
      </div>

      <div className="admin-users-table-wrap">
        <table className="board-list-table admin-reports-table">
          <thead>
            <tr>
              <th className="col-reporter">신청자</th>
              <th className="col-reasons">종류</th>
              <th className="col-detail">문의 내용</th>
              <th className="col-date">신청일</th>
              <th className="col-actions">처리</th>
              <th className="col-memo">비고</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="admin-users-placeholder">{t('common.loading')}</td></tr>
            ) : inquiries.length === 0 ? (
              <tr><td colSpan={6} className="admin-users-placeholder">{t('common.empty')}</td></tr>
            ) : inquiries.map(iq => {
              const isResolved = iq.status !== 'pending'
              return (
                <tr
                  key={iq.id}
                  className={`admin-report-row ${isResolved ? 'admin-report-row-resolved' : ''}`}
                >
                  <td className="col-reporter">
                    {iq.user ? (
                      <Link to={`/user/${encodeURIComponent(iq.user.name)}`} className="admin-report-user">
                        <img src={avatarOf(iq.user.avatarUrl)} alt="" className="admin-users-avatar" />
                        <div className="admin-inquiry-user-info">
                          <div>
                            {iq.user.name}
                            {iq.user.suspended && (
                              <span className="admin-report-flag admin-report-flag-suspended">정지</span>
                            )}
                          </div>
                          <div className="admin-report-muted">{iq.user.email}</div>
                        </div>
                      </Link>
                    ) : <span className="admin-report-muted">(탈퇴)</span>}
                  </td>
                  <td className="col-reasons">
                    <span className={`admin-inquiry-kind-badge admin-inquiry-kind-${iq.kind}`}>
                      {KIND_LABEL[iq.kind] || iq.kind}
                    </span>
                  </td>
                  <td className="col-detail">
                    <div className="admin-report-detail-cell">
                      <div className="admin-report-detail-preview">{iq.message}</div>
                      <div className="admin-report-detail-meta">
                        {iq.imageUrls.length > 0 && (
                          <span className="admin-report-detail-img-count" title={`첨부 이미지 ${iq.imageUrls.length}장`}>
                            📷 {iq.imageUrls.length}
                          </span>
                        )}
                        <button
                          type="button"
                          className="admin-report-detail-btn"
                          onClick={() => setDetailTarget(iq)}
                        >
                          자세히 보기
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="col-date">
                    <div>{formatDate(iq.createdAt)}</div>
                    {isResolved && iq.resolvedAt && (
                      <div className="admin-report-resolved-at">
                        처리 {formatDate(iq.resolvedAt)}
                      </div>
                    )}
                  </td>
                  <td className="col-actions">
                    {isResolved ? (
                      <div className="admin-report-resolved">
                        <div className="admin-report-resolved-label">
                          처리완료
                          {iq.resolveAction && (
                            <span className={`admin-report-action-badge admin-inquiry-action-${iq.resolveAction}`}>
                              {ACTION_LABEL[iq.resolveAction] || iq.resolveAction}
                            </span>
                          )}
                          {iq.resolverName && <span className="admin-report-resolver"> · {iq.resolverName}</span>}
                        </div>
                        {iq.resolveNote && (
                          <div className="admin-report-resolve-note" title={iq.resolveNote}>
                            {iq.resolveNote}
                          </div>
                        )}
                        <button
                          type="button"
                          className="admin-report-reopen-btn"
                          onClick={() => setReopenTarget(iq)}
                        >
                          되돌리기
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="admin-report-resolve-btn"
                        onClick={() => setResolveTarget(iq)}
                      >
                        답변하기
                      </button>
                    )}
                  </td>
                  <td className="col-memo">
                    <MemoCell
                      inquiry={iq}
                      onSaved={(id, memo) => setInquiries(prev => prev.map(x => x.id === id ? { ...x, adminMemo: memo } : x))}
                      onError={err => showToast(formatError(err), 'error')}
                      onOpenDetail={setMemoDetailText}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-users-pagination">
          <BoardPagination currentPage={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <DetailModal
        open={!!detailTarget}
        inquiry={detailTarget}
        onClose={() => setDetailTarget(null)}
      />

      <ResolveModal
        open={!!resolveTarget}
        inquiry={resolveTarget}
        templates={templates}
        onConfirm={handleResolve}
        onCancel={() => setResolveTarget(null)}
      />

      <ConfirmModal
        open={!!reopenTarget}
        title="답변 되돌리기"
        message="이 문의를 다시 미답변 상태로 되돌립니다. 정지 해제 등 실제 조치는 복구되지 않습니다. 계속하시겠어요?"
        confirmLabel="되돌리기"
        cancelLabel="취소"
        onConfirm={handleReopen}
        onCancel={() => setReopenTarget(null)}
      />

      <MemoDetailModal
        open={memoDetailText !== null}
        memo={memoDetailText || ''}
        onClose={() => setMemoDetailText(null)}
      />
    </div>
  )
}

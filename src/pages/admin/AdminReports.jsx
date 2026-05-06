import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import BoardPagination from '../../components/community/BoardPagination'
import ConfirmModal from '../../components/ConfirmModal'
import { avatarOf } from '../../utils/avatar'
import { fetchAdminReports, resolveReport, reopenReport, updateReportMemo } from '../../services/adminApi'

const PAGE_SIZE_OPTIONS = [20, 40, 60, 100]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '미해결' },
  { value: 'resolved', label: '해결' },
]

const REASON_CODES = ['spam', 'abuse', 'adult', 'privacy', 'fake', 'inappropriate', 'other']
const RESOLVE_NOTE_MAX = 500

const ACTION_LABEL = {
  post_delete: '글삭제',
  comment_delete: '댓글 삭제',
  suspend: '계정 정지',
  no_offense: '혐의 없음',
}

const MEMO_MAX = 1000

// Read-only modal that shows the full 비고 text (preview in the cell is
// clamped to 4 lines). Plain close button — edits still happen inline.
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

// Inline-editable 비고 cell. Shared across all admins — saving updates the
// single `reports.admin_memo` row; other admins see the new value on their
// next refresh. Edit state lives locally so the cell stays responsive; on
// save the API is called and the parent's cached value is updated.
function MemoCell({ report, onSaved, onError, onOpenDetail }) {
  const initial = report.adminMemo || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  // If the list reloads and the memo on this row changed under us, resync the
  // draft unless the user is actively editing.
  useEffect(() => {
    if (!editing) setDraft(initial)
  }, [initial, editing])

  async function save() {
    if (saving) return
    if (draft === initial) { setEditing(false); return }
    setSaving(true)
    try {
      await updateReportMemo(report.id, draft)
      onSaved(report.id, draft)
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

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// Detail modal: full evidence images + full reason text so admins don't have
// to squint at the truncated column preview.
function DetailModal({ open, report, onClose, t }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !report) return null
  const msg = stripReasonPrefix(report.reason)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">신고 상세</h2>
        <div className="admin-report-detail">
          {report.reasonCodes.length > 0 && (
            <div className="admin-report-detail-section">
              <div className="admin-report-detail-label">사유</div>
              <div className="admin-report-reasons">
                {report.reasonCodes.map(code => <ReasonBadge key={code} code={code} t={t} />)}
              </div>
            </div>
          )}

          <div className="admin-report-detail-section">
            <div className="admin-report-detail-label">신고 내용</div>
            {msg ? (
              <div className="admin-report-detail-text">{msg}</div>
            ) : (
              <div className="admin-report-muted">(상세 없음)</div>
            )}
          </div>

          {report.imageUrls.length > 0 && (
            <div className="admin-report-detail-section">
              <div className="admin-report-detail-label">
                증거 이미지 ({report.imageUrls.length})
              </div>
              <div className="admin-report-detail-images">
                {report.imageUrls.map((url, i) => (
                  <a
                    key={url + i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-report-detail-image"
                  >
                    <img src={url} alt={`evidence ${i + 1}`} />
                  </a>
                ))}
              </div>
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

// Action → default notification template. {name} is substituted with the
// reportee's nickname (or the reporter's, for no_offense). Admin can edit the
// text before sending.
const RESOLVE_ACTIONS = [
  { value: 'post_delete',    label: '글삭제',    recipient: 'reportee' },
  { value: 'comment_delete', label: '댓글 삭제', recipient: 'reportee' },
  { value: 'suspend',        label: '계정 정지', recipient: 'reportee' },
  { value: 'no_offense',     label: '혐의 없음', recipient: 'reporter' },
]
const RESOLVE_TEMPLATES = {
  post_delete:    '{name}님이 작성하신 게시글이 커뮤니티 규정 위반으로 삭제되었습니다. 반복 시 계정 이용에 제한이 있을 수 있습니다.',
  comment_delete: '{name}님이 작성하신 댓글이 커뮤니티 규정 위반으로 삭제되었습니다. 반복 시 계정 이용에 제한이 있을 수 있습니다.',
  suspend:        '{name}님의 계정이 커뮤니티 규정 위반으로 정지되었습니다. 자세한 사유는 운영팀에 문의해 주세요.',
  no_offense:     '신고해 주신 내용을 검토한 결과 혐의가 확인되지 않았습니다. 소중한 제보 감사드립니다.',
}

function renderTemplate(action, report) {
  const tpl = RESOLVE_TEMPLATES[action] || ''
  const recipient = RESOLVE_ACTIONS.find(a => a.value === action)?.recipient
  const user = recipient === 'reporter' ? report?.reporter : report?.reportee
  const name = user?.name || '회원'
  return tpl.replace(/\{name\}/g, name)
}

function ResolveModal({ open, report, onConfirm, onCancel }) {
  const [action, setAction] = useState('post_delete')
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false) // tracks if user manually edited the textarea
  const [submitting, setSubmitting] = useState(false)

  // On open, pick a sensible default action based on target type.
  useEffect(() => {
    if (!open || !report) return
    const defaultAction = report.targetType === 'comment' ? 'comment_delete' : 'post_delete'
    setAction(defaultAction)
    setMessage(renderTemplate(defaultAction, report))
    setEdited(false)
    setSubmitting(false)
  }, [open, report])

  // When the radio changes, replace the textarea with the new template UNLESS
  // the admin already typed over it (respect their edits).
  useEffect(() => {
    if (!open || !report || edited) return
    setMessage(renderTemplate(action, report))
  }, [action, open, report, edited])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open || !report) return null

  const recipientLabel = RESOLVE_ACTIONS.find(a => a.value === action)?.recipient === 'reporter'
    ? `신고자 (${report.reporter?.name || '회원'})`
    : `피신고자 (${report.reportee?.name || '회원'})`

  async function submit() {
    if (!message.trim()) return
    setSubmitting(true)
    try {
      await onConfirm({ action, message: message.trim() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">신고 처리</h2>
        <p className="modal-body">
          실제 글 삭제·유저 정지 등은 수동으로 먼저 진행한 뒤 처리해주세요. 아래 메시지가 알림으로 전송됩니다.
        </p>
        <div className="modal-form">
          <div className="modal-field">
            <span className="modal-field-label">처리 결과</span>
            <div className="admin-resolve-options">
              {RESOLVE_ACTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`admin-resolve-option ${action === opt.value ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="resolve-action"
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

          <label className="modal-field">
            <span className="modal-field-label">
              전송 메시지
              <span className="report-details-hint">
                ({recipientLabel}에게 · {message.length}/{RESOLVE_NOTE_MAX})
              </span>
            </span>
            <textarea
              className="modal-input modal-textarea"
              value={message}
              onChange={e => { setMessage(e.target.value.slice(0, RESOLVE_NOTE_MAX)); setEdited(true) }}
              rows={5}
              disabled={submitting}
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
            onClick={submit}
            disabled={submitting || !message.trim()}
          >
            {submitting ? '처리 중…' : '처리 완료'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Stored `reason` often carries a `[라벨 / 라벨] 상세` prefix (assembled by
// ReportModal for backward-compat display). Reason codes already have their
// own column as badges, so strip the bracket prefix to show only what the
// reporter actually typed.
function stripReasonPrefix(reason) {
  if (!reason) return ''
  const m = reason.match(/^\[[^\]]*\]\s?/)
  return m ? reason.slice(m[0].length) : reason
}

function ReasonBadge({ code, t }) {
  return (
    <span className={`report-reason-badge report-reason-${code}`}>
      {t(`community.report.reasons.${code}`)}
    </span>
  )
}

export default function AdminReports() {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()

  const [statusFilter, setStatusFilter] = useState('all')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const [resolveTarget, setResolveTarget] = useState(null)
  const [reopenTarget, setReopenTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [memoDetailText, setMemoDetailText] = useState(null)

  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [statusFilter, reasonFilter, pageSize, searchQuery])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAdminReports({
      page,
      pageSize,
      status: statusFilter,
      code: reasonFilter === 'all' ? undefined : reasonFilter,
      q: searchQuery,
    })
      .then(data => {
        if (cancelled) return
        setReports(data.reports)
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
  }, [page, pageSize, statusFilter, reasonFilter, searchQuery, reloadKey])

  async function handleResolve({ action, message }) {
    const r = resolveTarget
    if (!r) return
    try {
      await resolveReport(r.id, { action, message })
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
      await reopenReport(r.id)
      showToast('미해결로 되돌렸습니다', 'success')
      setReopenTarget(null)
      setReloadKey(k => k + 1)
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">신고 알림</h1>

      <div className="admin-users-controls">
        <label className="admin-field admin-users-search">
          <span className="admin-field-label">검색</span>
          <input
            type="text"
            className="admin-select admin-users-search-input"
            placeholder="닉네임 또는 내용"
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
          <span className="admin-field-label">사유</span>
          <select
            className="admin-select"
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {REASON_CODES.map(code => (
              <option key={code} value={code}>
                {t(`community.report.reasons.${code}`)}
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
          전체 <strong>{total.toLocaleString()}</strong>건
        </div>
      </div>

      <div className="admin-users-table-wrap">
        <table className="board-list-table admin-reports-table">
          <thead>
            <tr>
              <th className="col-reporter">신고자</th>
              <th className="col-reportee">피신고자</th>
              <th className="col-target">대상</th>
              <th className="col-reasons">사유</th>
              <th className="col-detail">신고 상세</th>
              <th className="col-date">신고일</th>
              <th className="col-actions">처리</th>
              <th className="col-memo">비고</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="admin-users-placeholder">{t('common.loading')}</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={8} className="admin-users-placeholder">{t('common.empty')}</td></tr>
            ) : reports.map(r => {
              const isResolved = r.status !== 'pending'
              return (
                <tr
                  key={r.id}
                  className={`admin-report-row ${isResolved ? 'admin-report-row-resolved' : ''}`}
                >
                  <td className="col-reporter">
                    {r.reporter ? (
                      <Link to={`/user/${encodeURIComponent(r.reporter.name)}`} className="admin-report-user">
                        <img src={avatarOf(r.reporter.avatarUrl)} alt="" className="admin-users-avatar" />
                        <span>{r.reporter.name}</span>
                      </Link>
                    ) : <span className="admin-report-muted">(탈퇴)</span>}
                  </td>
                  <td className="col-reportee">
                    {r.reportee ? (
                      <Link to={`/user/${encodeURIComponent(r.reportee.name)}`} className="admin-report-user">
                        <img src={avatarOf(r.reportee.avatarUrl)} alt="" className="admin-users-avatar" />
                        <span>
                          {r.reportee.name}
                          {r.reportee.suspended && <span className="admin-report-flag admin-report-flag-suspended">정지</span>}
                        </span>
                      </Link>
                    ) : <span className="admin-report-muted">(탈퇴)</span>}
                  </td>
                  <td className="col-target">
                    <div className="admin-report-target">
                      <span className={`admin-report-type-badge admin-report-type-${r.targetType}`}>
                        {r.targetType === 'post' ? '글' : '댓글'}
                      </span>
                      {r.targetUrl ? (
                        <a
                          href={r.targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-report-target-link"
                        >
                          {r.targetTitle || '(제목 없음)'}
                          <span className="admin-report-external-icon" aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <span className="admin-report-muted">{r.targetTitle || '(원본 없음)'}</span>
                      )}
                      {r.targetDeleted && <span className="admin-report-flag admin-report-flag-deleted">삭제됨</span>}
                    </div>
                    {r.targetSnippet && (
                      <div className="admin-report-snippet" title={r.targetSnippet}>
                        {r.targetSnippet}
                      </div>
                    )}
                    {r.duplicateCount > 1 && (
                      <div className="admin-report-dup">동일 대상 신고 {r.duplicateCount}건</div>
                    )}
                  </td>
                  <td className="col-reasons">
                    <div className="admin-report-reasons">
                      {r.reasonCodes.length > 0
                        ? r.reasonCodes.map(code => <ReasonBadge key={code} code={code} t={t} />)
                        : <span className="admin-report-muted">-</span>}
                    </div>
                  </td>
                  <td className="col-detail">
                    {(() => {
                      const msg = stripReasonPrefix(r.reason)
                      const imgCount = r.imageUrls.length
                      return (
                        <div className="admin-report-detail-cell">
                          <div className="admin-report-detail-preview">
                            {msg || <span className="admin-report-muted">(상세 없음)</span>}
                          </div>
                          <div className="admin-report-detail-meta">
                            {imgCount > 0 && (
                              <span className="admin-report-detail-img-count" title={`첨부 이미지 ${imgCount}장`}>
                                📷 {imgCount}
                              </span>
                            )}
                            <button
                              type="button"
                              className="admin-report-detail-btn"
                              onClick={() => setDetailTarget(r)}
                            >
                              자세히 보기
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="col-date">
                    <div>{formatDate(r.createdAt)}</div>
                    {isResolved && r.resolvedAt && (
                      <div className="admin-report-resolved-at">
                        처리 {formatDate(r.resolvedAt)}
                      </div>
                    )}
                  </td>
                  <td className="col-actions">
                    {isResolved ? (
                      <div className="admin-report-resolved">
                        <div className="admin-report-resolved-label">
                          처리완료
                          {r.resolveAction && (
                            <span className={`admin-report-action-badge admin-report-action-${r.resolveAction}`}>
                              {ACTION_LABEL[r.resolveAction] || r.resolveAction}
                            </span>
                          )}
                          {r.resolverName && <span className="admin-report-resolver"> · {r.resolverName}</span>}
                        </div>
                        {r.resolveNote && (
                          <div className="admin-report-resolve-note" title={r.resolveNote}>
                            {r.resolveNote}
                          </div>
                        )}
                        <button
                          type="button"
                          className="admin-report-reopen-btn"
                          onClick={() => setReopenTarget(r)}
                        >
                          되돌리기
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="admin-report-resolve-btn"
                        onClick={() => setResolveTarget(r)}
                      >
                        처리하기
                      </button>
                    )}
                  </td>
                  <td className="col-memo">
                    <MemoCell
                      report={r}
                      onSaved={(id, memo) => setReports(prev => prev.map(x => x.id === id ? { ...x, adminMemo: memo } : x))}
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
        report={detailTarget}
        onClose={() => setDetailTarget(null)}
        t={t}
      />

      <ResolveModal
        open={!!resolveTarget}
        report={resolveTarget}
        onConfirm={handleResolve}
        onCancel={() => setResolveTarget(null)}
      />

      <ConfirmModal
        open={!!reopenTarget}
        title="처리 되돌리기"
        message="이 신고를 다시 미해결 상태로 되돌립니다. 계속하시겠어요?"
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

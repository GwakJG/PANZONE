import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import BoardPagination from '../../components/community/BoardPagination'
import UserTierBadge from '../../components/UserTierBadge'
import { avatarOf } from '../../utils/avatar'
import { fetchAdminUsers } from '../../services/adminApi'

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

function formatDate(iso) {
  if (!iso) return '-'
  const s = String(iso)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}.${m[2]}.${m[3]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const RETENTION_DAYS = 30
// Days until content purge. Returns negative-ish values already trimmed to 0.
function daysUntilPurge(suspendedAt) {
  if (!suspendedAt) return null
  const since = Date.now() - new Date(suspendedAt).getTime()
  const daysElapsed = Math.floor(since / (24 * 60 * 60 * 1000))
  return Math.max(0, RETENTION_DAYS - daysElapsed)
}

function SortIndicator({ columnKey, sortKey, sortOrder }) {
  const active = sortKey === columnKey
  return (
    <span className="col-sort" aria-hidden="true">
      <span className={`col-sort-arrow up ${active && sortOrder === 'asc' ? 'active' : ''}`}>▲</span>
      <span className={`col-sort-arrow down ${active && sortOrder === 'desc' ? 'active' : ''}`}>▼</span>
    </span>
  )
}

function SortableTh({ columnKey, label, sortKey, sortOrder, onClick, className }) {
  const active = sortKey === columnKey
  return (
    <th
      className={`${className} col-sortable ${active ? 'active' : ''}`}
      onClick={() => onClick(columnKey)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(columnKey) } }}
    >
      <span className="col-label">{label}</span>
      <SortIndicator columnKey={columnKey} sortKey={sortKey} sortOrder={sortOrder} />
    </th>
  )
}

export default function AdminUsers() {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()

  const [tierFilter, setTierFilter] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [sortKey, setSortKey] = useState(null)
  const [sortOrder, setSortOrder] = useState(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Debounce search input — 300ms idle before committing to the actual query.
  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  // Any filter/sort/size/search change → back to page 1.
  useEffect(() => { setPage(1) }, [tierFilter, pageSize, sortKey, sortOrder, searchQuery])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAdminUsers({ page, pageSize, tier: tierFilter, sort: sortKey, order: sortOrder, q: searchQuery })
      .then(data => {
        if (cancelled) return
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(err => {
        if (cancelled) return
        showToast(formatError(err), 'error')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // showToast / formatError are intentionally excluded: formatError is
    // re-created every render (useApiError returns a fresh fn), which would
    // cause an infinite fetch loop if added here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, tierFilter, sortKey, sortOrder, searchQuery])

  function handleSortClick(key) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortOrder('asc')
    } else if (sortOrder === 'asc') {
      setSortOrder('desc')
    } else {
      // third click → back to default (no explicit sort; server default = 관리자핀 + date desc)
      setSortKey(null)
      setSortOrder(null)
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">유저</h1>

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
      </div>

      <div className="admin-users-table-wrap">
        <table className="board-list-table admin-users-table">
          <thead>
            <tr>
              <th className="col-avatar"></th>
              <SortableTh
                columnKey="name"
                label="닉네임"
                sortKey={sortKey}
                sortOrder={sortOrder}
                onClick={handleSortClick}
                className="col-name"
              />
              <th className="col-email">이메일</th>
              <th className="col-tier">등급</th>
              <SortableTh
                columnKey="date"
                label="가입일"
                sortKey={sortKey}
                sortOrder={sortOrder}
                onClick={handleSortClick}
                className="col-joined"
              />
              <th className="col-counts">글/댓글/방문</th>
              <SortableTh
                columnKey="activity"
                label="최근 접속"
                sortKey={sortKey}
                sortOrder={sortOrder}
                onClick={handleSortClick}
                className="col-last-visit"
              />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="admin-users-placeholder">{t('common.loading')}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="admin-users-placeholder">{t('common.empty')}</td></tr>
            ) : (
              users.map(u => {
                const pinned = !u.suspended && (u.role === 'admin' || u.role === 'mod')
                return (
                  <tr
                    key={u.id}
                    className={`${pinned ? 'admin-users-row-pinned' : ''} ${u.suspended ? 'admin-users-row-suspended' : ''}`}
                  >
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
                      {u.suspended ? (
                        <span className="admin-users-suspended-label">
                          {u.dataPurged
                            ? '데이터 삭제됨'
                            : `정지 (D-${daysUntilPurge(u.suspendedAt)})`}
                        </span>
                      ) : t(`tier.tier${u.tier}`)}
                    </td>
                    <td className="col-joined">{formatDate(u.createdAt)}</td>
                    <td className="col-counts">
                      <span>{u.postCount.toLocaleString()}</span>
                      <span className="admin-users-sep">·</span>
                      <span>{u.commentCount.toLocaleString()}</span>
                      <span className="admin-users-sep">·</span>
                      <span>{u.visitCount.toLocaleString()}</span>
                    </td>
                    <td className="col-last-visit">{formatDate(u.lastVisitDate)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-users-pagination">
          <BoardPagination
            currentPage={page}
            totalPages={totalPages}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import BoardPagination from '../../components/community/BoardPagination'
import ConfirmModal from '../../components/ConfirmModal'
import {
  fetchAdminNotices,
  fetchAdminBoards,
  toggleNoticeFavorite,
  toggleNoticePin,
  deleteNotice,
  fetchNoticeDrafts,
  deleteNoticeDraft,
} from '../../services/adminApi'

// Matches SortableTh cycle: asc → desc → none. Non-table variant reused from AdminFeatured.
function SortButton({ columnKey, label, sortKey, sortOrder, onClick }) {
  const active = sortKey === columnKey
  return (
    <button
      type="button"
      className={`admin-sort-btn ${active ? 'active' : ''}`}
      onClick={() => onClick(columnKey)}
    >
      <span className="col-label">{label}</span>
      <span className="col-sort" aria-hidden="true">
        <span className={`col-sort-arrow up ${active && sortOrder === 'asc' ? 'active' : ''}`}>▲</span>
        <span className={`col-sort-arrow down ${active && sortOrder === 'desc' ? 'active' : ''}`}>▼</span>
      </span>
    </button>
  )
}

// Modal: pick one or more boards to broadcast a notice to. Single-select still
// supported — picking 1 board uses the normal write flow; 2+ boards triggers
// the broadcast API which creates identical posts in each board atomically.
function PickBoardModal({ open, boards, onCancel, onPick }) {
  return open ? <PickBoardModalInner key="open" boards={boards} onCancel={onCancel} onPick={onPick} /> : null
}

function PickBoardModalInner({ boards, onCancel, onPick }) {
  const [selected, setSelected] = useState(new Set())
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  function toggle(slug) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }
  const count = selected.size
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card admin-notices-pick-board" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">공지 작성 게시판 선택</h2>
        <p className="modal-body">여러 개 선택 시 동일한 공지가 모든 선택한 게시판에 동시 게시됩니다.</p>
        <div className="admin-notices-board-grid">
          {boards.map(b => {
            const active = selected.has(b.slug)
            return (
              <button
                key={b.slug}
                type="button"
                className={`admin-notices-board-chip ${active ? 'active' : ''}`}
                onClick={() => toggle(b.slug)}
              >
                {b.name}
              </button>
            )
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>취소</button>
          <button
            type="button"
            className="modal-btn-primary"
            disabled={count === 0}
            onClick={() => onPick(Array.from(selected))}
          >
            {count === 0 ? '게시판 선택' : count === 1 ? '작성하기' : `${count}개 게시판에 작성`}
          </button>
        </div>
      </div>
    </div>
  )
}


export default function AdminNotices() {
  const navigate = useNavigate()
  const showToast = useToast()
  const formatError = useApiError()

  const [boards, setBoards] = useState([])
  const [board, setBoard] = useState('all')
  const [status, setStatus] = useState('all') // 'all' | 'active' | 'drafts'
  const [drafts, setDrafts] = useState([])
  const [draftDeleteTarget, setDraftDeleteTarget] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortOrder, setSortOrder] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [pickBoardOpen, setPickBoardOpen] = useState(false)
  const [unpinConfirm, setUnpinConfirm] = useState(null) // post
  const [deleteTarget, setDeleteTarget] = useState(null) // post

  useEffect(() => {
    let cancelled = false
    fetchAdminBoards()
      .then(data => { if (!cancelled) setBoards(data.boards) })
      .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [board, searchQuery, sortKey, sortOrder, status])

  function reloadPosts() {
    setLoading(true)
    fetchAdminNotices({ page, pageSize, board, q: searchQuery, sort: sortKey, order: sortOrder, status })
      .then(data => {
        setPosts(data.posts)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(err => showToast(formatError(err), 'error'))
      .finally(() => setLoading(false))
  }

  function reloadDrafts() {
    setLoading(true)
    fetchNoticeDrafts()
      .then(data => {
        setDrafts(data.drafts)
        setTotal(data.drafts.length)
        setTotalPages(1)
      })
      .catch(err => showToast(formatError(err), 'error'))
      .finally(() => setLoading(false))
  }

  function reload() {
    if (status === 'drafts') reloadDrafts()
    else reloadPosts()
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (status === 'drafts') {
      fetchNoticeDrafts()
        .then(data => {
          if (cancelled) return
          setDrafts(data.drafts)
          setTotal(data.drafts.length)
          setTotalPages(1)
        })
        .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      fetchAdminNotices({ page, pageSize, board, q: searchQuery, sort: sortKey, order: sortOrder, status })
        .then(data => {
          if (cancelled) return
          setPosts(data.posts)
          setTotal(data.total)
          setTotalPages(data.totalPages)
        })
        .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, board, searchQuery, sortKey, sortOrder, status])

  function handleSortClick(key) {
    if (sortKey !== key) { setSortKey(key); setSortOrder('asc') }
    else if (sortOrder === 'asc') { setSortOrder('desc') }
    else { setSortKey(null); setSortOrder(null) }
  }

  async function handleToggleFavorite(post) {
    const next = !post.isFavorite
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isFavorite: next } : p))
    try {
      await toggleNoticeFavorite(post.id, next)
    } catch (err) {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isFavorite: post.isFavorite } : p))
      showToast(formatError(err), 'error')
    }
  }

  async function confirmUnpin() {
    const post = unpinConfirm
    setUnpinConfirm(null)
    if (!post) return
    try {
      const nextPinned = !post.pinned
      await toggleNoticePin(post.id, nextPinned)
      showToast(nextPinned ? '공지로 재지정했습니다' : '공지 해제했습니다', 'success')
      reload()
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  async function submitDelete() {
    const post = deleteTarget
    setDeleteTarget(null)
    if (!post) return
    try {
      await deleteNotice(post.id)
      showToast('삭제했습니다', 'success')
      reload()
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  function handleView(post) {
    window.open(`/community/${post.boardSlug}/${post.id}`, '_blank', 'noopener,noreferrer')
  }

  function handleOpenDraft(d) {
    navigate('/admin/notices/write', { state: { draftId: d.id } })
  }

  async function confirmDeleteDraft() {
    const d = draftDeleteTarget
    setDraftDeleteTarget(null)
    if (!d) return
    try {
      await deleteNoticeDraft(d.id)
      showToast('임시저장을 삭제했습니다', 'success')
      reloadDrafts()
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  function handlePickBoard(slugs) {
    setPickBoardOpen(false)
    if (!slugs.length) return
    // Admin-internal write page — keeps the admin shell, has preview + 게시 buttons.
    navigate('/admin/notices/write', { state: { boardSlugs: slugs } })
  }

  return (
    <div className="admin-page">
      <div className="admin-notices-head">
        <h1 className="admin-page-title">공지글</h1>
        <button
          type="button"
          className="modal-btn-primary"
          onClick={() => setPickBoardOpen(true)}
        >
          + 새 공지 작성
        </button>
      </div>
      <p className="admin-page-lead">
        전체 {total.toLocaleString()}개
      </p>

      <div className="admin-featured-tabs admin-notices-tabs">
        {[
          { key: 'all', label: '전체' },
          { key: 'active', label: '진행중' },
          { key: 'drafts', label: '임시저장' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`admin-featured-tab ${status === tab.key ? 'active' : ''}`}
            onClick={() => setStatus(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {status !== 'drafts' && <div className="admin-users-controls">
        <label className="admin-field admin-users-search">
          <span className="admin-field-label">검색</span>
          <input
            type="text"
            className="admin-select admin-users-search-input"
            placeholder="제목 검색"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </label>

        <label className="admin-field">
          <span className="admin-field-label">필터</span>
          <select
            className="admin-select"
            value={board}
            onChange={e => setBoard(e.target.value)}
          >
            <option value="favorite">⭐ 즐겨찾기</option>
            <option value="all">전체</option>
            {boards.map(b => (
              <option key={b.slug} value={b.slug}>{b.name}</option>
            ))}
          </select>
        </label>

        <div className="admin-field">
          <span className="admin-field-label">정렬</span>
          <div className="admin-sort-group">
            <SortButton columnKey="date" label="작성일" sortKey={sortKey} sortOrder={sortOrder} onClick={handleSortClick} />
            <SortButton columnKey="title" label="제목" sortKey={sortKey} sortOrder={sortOrder} onClick={handleSortClick} />
          </div>
        </div>
      </div>}

      <div className="admin-featured-notice-list">
        {status === 'drafts' ? (
          loading ? (
            <div className="admin-users-placeholder">불러오는 중...</div>
          ) : drafts.length === 0 ? (
            <div className="admin-users-placeholder">임시저장한 공지가 없습니다</div>
          ) : (
            drafts.map(d => (
              <div key={`draft-${d.id}`} className="admin-featured-notice-item">
                <div className="admin-featured-notice-slot is-empty" />
                <div
                  role="button"
                  tabIndex={0}
                  className="admin-featured-notice-row"
                  onClick={() => handleOpenDraft(d)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDraft(d) } }}
                  title="작성 이어하기"
                >
                  <div className="admin-featured-notice-thumb">
                    <div className="admin-featured-notice-thumb-empty" />
                  </div>
                  <div className="admin-featured-notice-info">
                    <div className="admin-featured-notice-title">
                      {d.title || <span className="admin-notice-draft-untitled">(제목 없음)</span>}
                    </div>
                    <div className="admin-featured-notice-meta">
                      대상: {d.boardSlugs.join(', ')} · {new Date(d.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="admin-featured-notice-actions" onClick={e => e.stopPropagation()}>
                    <button type="button" className="admin-featured-row-btn" onClick={() => handleOpenDraft(d)}>
                      이어쓰기
                    </button>
                    <button
                      type="button"
                      className="admin-featured-row-btn is-danger"
                      onClick={() => setDraftDeleteTarget(d)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="admin-featured-notice-drag is-empty" aria-hidden="true" />
              </div>
            ))
          )
        ) : loading ? (
          <div className="admin-users-placeholder">불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div className="admin-users-placeholder">공지글이 없습니다</div>
        ) : (
          posts.map(p => (
            <div key={p.id} className="admin-featured-notice-item">
              <div className="admin-featured-notice-slot is-empty" />
              <div className={`admin-featured-notice-row ${p.pinned ? 'is-featured' : ''}`}>
                <div className="admin-featured-notice-thumb">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className="admin-featured-notice-thumb-empty" />}
                </div>
                <div className="admin-featured-notice-info">
                  <div className="admin-featured-notice-title">
                    <span className="admin-featured-notice-board">[{p.boardName}]</span>
                    <a
                      href={`/community/${p.boardSlug}/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-featured-notice-title-link"
                    >
                      {p.title}
                    </a>
                    <button
                      type="button"
                      className={`admin-featured-fav-btn ${p.isFavorite ? 'active' : ''}`}
                      onClick={() => handleToggleFavorite(p)}
                      title={p.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                    >
                      {p.isFavorite ? '★' : '☆'}
                    </button>
                  </div>
                  <div className="admin-featured-notice-meta">
                    {p.author} · 조회 {p.views} · 댓글 {p.commentCount}
                  </div>
                </div>
                <div className="admin-featured-notice-actions">
                  <button type="button" className="admin-featured-row-btn" onClick={() => handleView(p)}>
                    글 보기
                  </button>
                  <button type="button" className="admin-featured-row-btn" onClick={() => setUnpinConfirm(p)}>
                    {p.pinned ? '공지 해제' : '공지 재지정'}
                  </button>
                  <button
                    type="button"
                    className="admin-featured-row-btn is-danger"
                    onClick={() => setDeleteTarget(p)}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="admin-featured-notice-drag is-empty" aria-hidden="true" />
            </div>
          ))
        )}
      </div>

      {status !== 'drafts' && totalPages > 1 && (
        <div className="admin-users-pagination">
          <BoardPagination currentPage={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <PickBoardModal
        open={pickBoardOpen}
        boards={boards}
        onCancel={() => setPickBoardOpen(false)}
        onPick={handlePickBoard}
      />

      <ConfirmModal
        open={!!unpinConfirm}
        title={unpinConfirm?.pinned ? '공지 해제' : '공지 재지정'}
        message={unpinConfirm?.pinned
          ? '이 공지를 해제합니다. 게시판에서 완전히 사라지고 (유저·관리자 모두) 여기 전체 탭에서만 관리 용도로 남습니다.'
          : '이 글을 공지로 다시 지정합니다. 게시판에 다시 노출됩니다.'}
        confirmLabel={unpinConfirm?.pinned ? '해제' : '재지정'}
        onConfirm={confirmUnpin}
        onCancel={() => setUnpinConfirm(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="공지글 삭제"
        message="이 공지글을 삭제합니다. 게시판에서 완전히 사라지고 되돌릴 수 없어요."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={submitDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!draftDeleteTarget}
        title="임시저장 삭제"
        message="이 임시저장본을 영구 삭제합니다. 되돌릴 수 없어요."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={confirmDeleteDraft}
        onCancel={() => setDraftDeleteTarget(null)}
      />
    </div>
  )
}

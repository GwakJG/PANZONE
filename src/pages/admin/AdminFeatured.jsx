import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import ConfirmModal from '../../components/ConfirmModal'
import BoardPagination from '../../components/community/BoardPagination'
import {
  fetchFeaturedSlots,
  createFeatured,
  updateFeatured,
  deleteFeatured,
  reorderFeatured,
  fetchAdminNotices,
  fetchAdminAuthoredPosts,
  fetchAdminBoards,
  toggleNoticeFavorite,
  toggleNoticePin,
} from '../../services/adminApi'
import { uploadImage } from '../../services/uploadApi'

const MAX_SLOTS = 10
const BANNER_TITLE_MAX = 200

// =========================================================================
// Slot card (draggable when filled)
// =========================================================================

function SlotCard({ slot, onAction }) {
  const item = slot.item
  const sortable = useSortable({
    id: `slot-${slot.slot}`,
    disabled: !item,
    // Keeps the "other cards shifting aside" motion during drag, but
    // skips the drop-snap animation when the mouse is released — card
    // lands at its target slot instantly.
    animateLayoutChanges: () => false,
  })
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable
  const style = {
    transform: CSS.Transform.toString(transform),
    // Suppress transition on the dragged card itself so it doesn't slide
    // back from its drag offset on release (other cards keep their shift
    // transition because only this item has isDragging=true).
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.4 : 1,
  }

  if (!item) {
    return (
      <div ref={setNodeRef} style={style} className="admin-featured-card admin-featured-card-empty">
        <div className="admin-featured-slot-num">{slot.slot}</div>
        <div className="admin-featured-empty-label">빈 슬롯</div>
      </div>
    )
  }

  const typeLabel = item.type === 'banner' ? '캐러셀 전용' : '공지'
  const displayTitle = item.type === 'banner' ? (item.title || '배너') : item.title

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`admin-featured-card ${item.type === 'banner' ? 'is-banner' : 'is-post'}`}
      {...attributes}
      {...listeners}
    >
      <div className="admin-featured-slot-num">{slot.slot}</div>
      <div className={`admin-featured-type-badge ${item.type === 'banner' ? 'is-banner' : 'is-post'}`}>
        {typeLabel}
      </div>

      {item.thumbnail ? (
        <img src={item.thumbnail} alt="" className="admin-featured-card-img" draggable={false} />
      ) : (
        <div className="admin-featured-card-placeholder" />
      )}

      {item.type === 'post' && item.deleted && (
        <div className="admin-featured-card-deleted">삭제된 글</div>
      )}

      <div className="admin-featured-card-caption">
        <span className="admin-featured-card-title">{displayTitle}</span>
      </div>

      <div className="admin-featured-card-hover">
        {item.type === 'banner' && (
          <button
            type="button"
            className="admin-featured-hover-btn"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onAction('edit', slot)}
          >
            수정하기
          </button>
        )}
        <button
          type="button"
          className="admin-featured-hover-btn"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAction('view', slot)}
        >
          {item.type === 'banner' ? '링크 열기' : '글 보기'}
        </button>
        <button
          type="button"
          className="admin-featured-hover-btn is-danger"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAction('delete', slot)}
        >
          제거
        </button>
      </div>
    </div>
  )
}

// =========================================================================
// Banner edit form (used inline in 캐러셀 전용 탭 and in the edit modal)
// =========================================================================

function BannerForm({ initial, onSubmit, onCancel, submitting, submitLabel = '등록' }) {
  const showToast = useToast()
  const formatError = useApiError()
  const fileInputRef = useRef(null)

  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || '')
  const [title, setTitle] = useState(initial?.title || '')
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl || '')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setImageUrl(initial?.imageUrl || '')
    setTitle(initial?.title || '')
    setLinkUrl(initial?.linkUrl || '')
  }, [initial])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setImageUrl(url)
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!imageUrl) {
      showToast('이미지를 업로드해주세요', 'error')
      return
    }
    onSubmit({ imageUrl, title: title.trim(), linkUrl: linkUrl.trim() })
  }

  return (
    <form className="admin-featured-banner-form" onSubmit={handleSubmit}>
      <div className="admin-featured-banner-preview">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="admin-featured-banner-img" />
        ) : (
          <div className="admin-featured-banner-placeholder">미리보기</div>
        )}
      </div>

      <div className="admin-featured-banner-fields">
        <div className="admin-field">
          <span className="admin-field-label">이미지 (16:7 권장)</span>
          <button
            type="button"
            className="admin-featured-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '업로드 중...' : imageUrl ? '다른 이미지로 교체' : '이미지 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        <label className="admin-field">
          <span className="admin-field-label">제목 (선택)</span>
          <input
            type="text"
            className="admin-select"
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, BANNER_TITLE_MAX))}
            placeholder="캐러셀에 표시할 제목"
          />
        </label>

        <label className="admin-field">
          <span className="admin-field-label">이동 링크 URL (선택)</span>
          <input
            type="text"
            className="admin-select"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://... 또는 /community/..."
          />
        </label>

        <div className="admin-featured-form-actions">
          {onCancel && (
            <button type="button" className="btn-cancel" onClick={onCancel}>
              취소
            </button>
          )}
          <button
            type="submit"
            className="modal-btn-primary"
            disabled={submitting || uploading || !imageUrl}
          >
            {submitting ? '저장 중...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

// =========================================================================
// 공지글 탭 (announcement post picker)
// =========================================================================

// Sort button with the same asc → desc → none cycle used by AdminUsers' SortableTh.
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

// Vertical-list sortable row used inside NoticePicker. Non-featured rows also
// render through this with `disabled=true` so the drag handle just stays gray
// and the row keeps its static layout — same column widths across rows.
function NoticeRow({ post, mode = 'notice', onPick, onAction, onToggleFavorite, onTogglePin }) {
  const showAdminActions = mode === 'notice'
  const disabled = !post.isFeatured
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: post.isFeatured ? `notice-${post.featuredId}` : `notice-static-${post.id}`,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="admin-featured-notice-item">
      <div className={`admin-featured-notice-slot ${post.isFeatured ? '' : 'is-empty'}`}>
        {post.isFeatured ? post.featuredOrder : ''}
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`admin-featured-notice-row ${post.isFeatured ? 'is-featured' : ''}`}
        onClick={() => onPick(post)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(post) } }}
        title={post.isFeatured ? '이미 캐러셀에 등록됨' : '캐러셀에 등록'}
      >
        <div className="admin-featured-notice-thumb">
          {post.thumbnail ? <img src={post.thumbnail} alt="" /> : <div className="admin-featured-notice-thumb-empty" />}
        </div>
        <div className="admin-featured-notice-info">
          <div className="admin-featured-notice-title">
            <span className="admin-featured-notice-board">[{post.boardName}]</span>
            {post.title}
            {showAdminActions && (
              <>
                <button
                  type="button"
                  className={`admin-featured-fav-btn ${post.isFavorite ? 'active' : ''}`}
                  onClick={e => { e.stopPropagation(); onToggleFavorite(post) }}
                  aria-label={post.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                  title={post.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                >
                  {post.isFavorite ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className="admin-featured-pin-btn active"
                  onClick={e => { e.stopPropagation(); onTogglePin(post) }}
                  aria-label="공지 해제"
                  title="공지 해제 (이 리스트에서 사라집니다)"
                >
                  📌
                </button>
              </>
            )}
          </div>
          <div className="admin-featured-notice-meta">
            {post.author} · 조회 {post.views} · 댓글 {post.commentCount}
          </div>
        </div>
        <div className="admin-featured-notice-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="admin-featured-row-btn"
            onClick={() => onAction('view', post)}
          >
            글 보기
          </button>
          {post.isFeatured && (
            <button
              type="button"
              className="admin-featured-row-btn is-danger"
              onClick={() => onAction('delete', post)}
            >
              제거
            </button>
          )}
        </div>
        {post.isFeatured && <div className="admin-featured-notice-badge">등록됨</div>}
      </div>
      {post.isFeatured ? (
        <button
          type="button"
          className="admin-featured-notice-drag"
          aria-label="순서 변경"
          {...attributes}
          {...listeners}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="5" r="1.8" /><circle cx="15" cy="5" r="1.8" />
            <circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" />
            <circle cx="9" cy="19" r="1.8" /><circle cx="15" cy="19" r="1.8" />
          </svg>
        </button>
      ) : (
        <div className="admin-featured-notice-drag is-empty" aria-hidden="true" />
      )}
    </div>
  )
}

function NoticePicker({ mode = 'notice', onPick, onAction, onReorder, refreshKey }) {
  const showToast = useToast()
  const formatError = useApiError()
  const fetchPosts = mode === 'adminPost' ? fetchAdminAuthoredPosts : fetchAdminNotices
  const emptyLabel = mode === 'adminPost' ? '관리자 글이 없습니다' : '공지글이 없습니다'

  const [boards, setBoards] = useState([]) // fetched from /api/admin/boards
  const [board, setBoard] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortOrder, setSortOrder] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [posts, setPosts] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Board list — dynamic so new boards auto-appear in the filter.
  // 관리자 글 탭은 data 보드(확률형 아이템 등)도 포함시켜야 필터에서 선택 가능.
  useEffect(() => {
    let cancelled = false
    fetchAdminBoards({ includeData: mode === 'adminPost' })
      .then(data => { if (!cancelled) setBoards(data.boards) })
      .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    const tid = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(tid)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [board, searchQuery, sortKey, sortOrder])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPosts({ page, pageSize, board, q: searchQuery, sort: sortKey, order: sortOrder })
      .then(data => {
        if (cancelled) return
        setPosts(data.posts)
        setTotalPages(data.totalPages)
      })
      .catch(err => {
        if (cancelled) return
        showToast(formatError(err), 'error')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, board, searchQuery, sortKey, sortOrder, refreshKey, mode])

  function handleSortClick(key) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortOrder('asc')
    } else if (sortOrder === 'asc') {
      setSortOrder('desc')
    } else {
      setSortKey(null)
      setSortOrder(null)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Only featured rows participate in drag reorder. Ordered by current display_order.
  const featuredPosts = posts.filter(p => p.isFeatured)

  async function handleToggleFavorite(post) {
    const nextFavorite = !post.isFavorite
    // Optimistic local update so the star flips immediately
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isFavorite: nextFavorite } : p))
    try {
      await toggleNoticeFavorite(post.id, nextFavorite)
    } catch (err) {
      // Revert on failure
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isFavorite: post.isFavorite } : p))
      showToast(formatError(err), 'error')
    }
  }

  async function handleTogglePin(post) {
    // Picker only shows pinned posts, so this always unpins. Row disappears from
    // the list after the refresh — mirrors the "공지 해제" action in AdminNotices.
    try {
      await toggleNoticePin(post.id, false)
      showToast('공지에서 해제했습니다', 'success')
      // Remove from local posts immediately, then bump refresh for server truth
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  async function handleNoticeDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = featuredPosts.findIndex(p => `notice-${p.featuredId}` === active.id)
    const newIdx = featuredPosts.findIndex(p => `notice-${p.featuredId}` === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const nextOrder = arrayMove(featuredPosts, oldIdx, newIdx)
    const ids = nextOrder.map(p => p.featuredId)
    try {
      await reorderFeatured(ids)
      onReorder && onReorder()
    } catch (err) {
      showToast(formatError(err), 'error')
    }
  }

  return (
    <div className="admin-featured-notice-picker">
      <div className="admin-users-controls">
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
            <SortButton
              columnKey="date"
              label="작성일"
              sortKey={sortKey}
              sortOrder={sortOrder}
              onClick={handleSortClick}
            />
            <SortButton
              columnKey="title"
              label="제목"
              sortKey={sortKey}
              sortOrder={sortOrder}
              onClick={handleSortClick}
            />
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleNoticeDragEnd}>
        <SortableContext
          items={featuredPosts.map(p => `notice-${p.featuredId}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="admin-featured-notice-list">
            {loading ? (
              <div className="admin-users-placeholder">불러오는 중...</div>
            ) : posts.length === 0 ? (
              <div className="admin-users-placeholder">{emptyLabel}</div>
            ) : (
              posts.map(p => (
                <NoticeRow
                  key={p.id}
                  post={p}
                  mode={mode}
                  onPick={onPick}
                  onAction={onAction}
                  onToggleFavorite={handleToggleFavorite}
                  onTogglePin={handleTogglePin}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {totalPages > 1 && (
        <div className="admin-users-pagination">
          <BoardPagination currentPage={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

// =========================================================================
// 교체 슬롯 선택 모달 (10 slots full scenario)
// =========================================================================

function ReplaceSlotModal({ open, slots, onCancel, onPick }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card admin-featured-replace-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">교체할 캐러셀을 선택하세요</h2>
        <p className="modal-body">10개 슬롯이 모두 차 있습니다. 교체할 슬롯을 고르세요.</p>
        <div className="admin-featured-replace-grid">
          {slots.filter(s => s.item).map(slot => {
            const item = slot.item
            return (
              <button
                key={slot.slot}
                type="button"
                className="admin-featured-replace-item"
                onClick={() => onPick(slot)}
              >
                <span className="admin-featured-slot-num">{slot.slot}</span>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="admin-featured-replace-thumb" />
                ) : (
                  <div className="admin-featured-replace-thumb admin-featured-replace-thumb-empty" />
                )}
                <span className="admin-featured-replace-title">
                  {item.type === 'banner' ? (item.title || '배너') : item.title}
                </span>
                <span className={`admin-featured-type-badge ${item.type === 'banner' ? 'is-banner' : 'is-post'}`}>
                  {item.type === 'banner' ? '캐러셀 전용' : '공지'}
                </span>
              </button>
            )
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// Banner edit modal (standalone)
// =========================================================================

function BannerEditModal({ open, initial, onCancel, onSave, submitting }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card admin-featured-banner-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">캐러셀 전용 배너 수정</h2>
        <BannerForm
          initial={initial}
          onSubmit={onSave}
          onCancel={onCancel}
          submitting={submitting}
          submitLabel="저장"
        />
      </div>
    </div>
  )
}

// =========================================================================
// Main page
// =========================================================================

export default function AdminFeatured() {
  const navigate = useNavigate()
  const showToast = useToast()
  const formatError = useApiError()

  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bottomTab, setBottomTab] = useState('notice') // 'notice' | 'adminPost' | 'banner'
  // Bumped after every slot mutation so NoticePicker re-fetches its own list
  // (needed to sync the `isFeatured` flag / background color after register/replace/delete).
  const [noticeRefreshKey, setNoticeRefreshKey] = useState(0)
  // Remounts BannerForm after a successful register/replace so the form clears
  // (image/title/link wiped) — next registration starts fresh, not "교체".
  const [bannerFormKey, setBannerFormKey] = useState(0)

  // Confirm modals
  const [viewConfirm, setViewConfirm] = useState(null) // { slot }
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { slot }

  // Banner edit modal (existing slot being edited)
  const [bannerEdit, setBannerEdit] = useState(null) // { slot } or null

  // Pending registration → opens replace modal if 10 full
  const [pendingPost, setPendingPost] = useState(null)     // { postId, title }
  const [pendingBanner, setPendingBanner] = useState(null) // { imageUrl, title, linkUrl }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const load = useCallback(() => {
    setLoading(true)
    fetchFeaturedSlots()
      .then(data => setSlots(data.slots))
      .catch(err => showToast(formatError(err), 'error'))
      .finally(() => setLoading(false))
    setNoticeRefreshKey(k => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const filledCount = slots.filter(s => s.item).length
  const isFull = filledCount >= MAX_SLOTS

  // ---- Actions on existing slot cards ----

  function handleCardAction(action, slot) {
    const item = slot.item
    if (!item) return
    if (action === 'edit') {
      if (item.type === 'banner') {
        setBannerEdit({ slot })
      } else {
        // 공지글은 관리자 공지글 탭에서 작성하니까 거기로 이동
        navigate(`/admin/notices`)
      }
      return
    }
    if (action === 'view') {
      setViewConfirm({ slot })
      return
    }
    if (action === 'delete') {
      setDeleteConfirm({ slot })
    }
  }

  function confirmView() {
    const item = viewConfirm?.slot?.item
    setViewConfirm(null)
    if (!item) return
    if (item.type === 'banner') {
      if (!item.linkUrl) {
        showToast('이 배너에는 이동 링크가 설정되지 않았습니다', 'default')
        return
      }
      // "/…" is internal; anything else is external and gets https:// if missing
      const isInternal = item.linkUrl.startsWith('/')
      const href = isInternal
        ? item.linkUrl
        : /^https?:\/\//i.test(item.linkUrl) ? item.linkUrl : `https://${item.linkUrl}`
      window.open(href, '_blank', 'noopener,noreferrer')
    } else {
      window.open(`/community/${item.boardSlug}/${item.postId}`, '_blank', 'noopener,noreferrer')
    }
  }

  async function confirmDelete() {
    const slot = deleteConfirm?.slot
    setDeleteConfirm(null)
    if (!slot?.item) return
    try {
      setSaving(true)
      await deleteFeatured(slot.item.featuredId)
      showToast('캐러셀에서 제거했습니다', 'success')
      load()
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---- Drag reorder ----

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = slots.findIndex(s => `slot-${s.slot}` === active.id)
    const newIdx = slots.findIndex(s => `slot-${s.slot}` === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    if (!slots[oldIdx].item || !slots[newIdx].item) return // only filled slots reorder among each other

    const filled = slots.filter(s => s.item)
    const filledOldIdx = filled.findIndex(s => s.slot === slots[oldIdx].slot)
    const filledNewIdx = filled.findIndex(s => s.slot === slots[newIdx].slot)
    const newFilled = arrayMove(filled, filledOldIdx, filledNewIdx)
    const ids = newFilled.map(s => s.item.featuredId)

    // Optimistic: re-assign slot numbers 1..N, keep empty placeholders at the end
    const nextSlots = []
    for (let i = 0; i < newFilled.length; i++) {
      nextSlots.push({ slot: i + 1, item: { ...newFilled[i].item, slot: i + 1 } })
    }
    for (let i = newFilled.length; i < MAX_SLOTS; i++) {
      nextSlots.push({ slot: i + 1, item: null })
    }
    setSlots(nextSlots)

    try {
      await reorderFeatured(ids)
      // Slot state is already optimistic-updated above; just nudge the notice
      // list so featured ordering there follows the new display_order.
      setNoticeRefreshKey(k => k + 1)
    } catch (err) {
      showToast(formatError(err), 'error')
      load()
    }
  }

  // ---- Registration flow ----

  async function registerPost(postId) {
    if (isFull) {
      setPendingPost({ postId })
      return
    }
    try {
      setSaving(true)
      await createFeatured({ type: 'post', postId })
      showToast('캐러셀에 등록했습니다', 'success')
      load()
    } catch (err) {
      const msg = err.message === 'ALREADY_FEATURED'
        ? '이미 등록된 공지글입니다'
        : err.message === 'SLOT_FULL'
        ? '슬롯이 가득 찼습니다'
        : formatError(err)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function registerBanner(payload) {
    if (isFull) {
      setPendingBanner(payload)
      return
    }
    try {
      setSaving(true)
      await createFeatured({ type: 'banner', ...payload })
      showToast('캐러셀에 등록했습니다', 'success')
      setBannerFormKey(k => k + 1)
      load()
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function replaceSlot(slot) {
    const target = slot.item.featuredId
    try {
      setSaving(true)
      if (pendingPost) {
        await updateFeatured(target, { type: 'post', postId: pendingPost.postId })
      } else if (pendingBanner) {
        await updateFeatured(target, { type: 'banner', ...pendingBanner })
      }
      showToast('교체했습니다', 'success')
      setPendingPost(null)
      setPendingBanner(null)
      setBannerFormKey(k => k + 1)
      load()
    } catch (err) {
      const msg = err.message === 'ALREADY_FEATURED' ? '이미 등록된 공지글입니다' : formatError(err)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveBannerEdit(payload) {
    const slot = bannerEdit?.slot
    if (!slot?.item) return
    try {
      setSaving(true)
      await updateFeatured(slot.item.featuredId, { type: 'banner', ...payload })
      showToast('저장했습니다', 'success')
      setBannerEdit(null)
      load()
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">캐러셀 등록</h1>
      <p className="admin-page-lead">
        홈 캐러셀에 노출할 공지글·배너를 등록하고 드래그로 순서를 바꿀 수 있습니다 ({filledCount}/{MAX_SLOTS})
      </p>

      {/* Top: 10 slot cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slots.map(s => `slot-${s.slot}`)} strategy={rectSortingStrategy}>
          <div className="admin-featured-grid">
            {loading ? (
              <div className="admin-users-placeholder">불러오는 중...</div>
            ) : (
              slots.map(slot => (
                <SlotCard key={slot.slot} slot={slot} onAction={handleCardAction} />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Bottom: tabs */}
      <div className="admin-featured-bottom">
        <div className="admin-featured-tabs">
          <button
            type="button"
            className={`admin-featured-tab ${bottomTab === 'notice' ? 'active' : ''}`}
            onClick={() => setBottomTab('notice')}
          >
            공지글
          </button>
          <button
            type="button"
            className={`admin-featured-tab ${bottomTab === 'adminPost' ? 'active' : ''}`}
            onClick={() => setBottomTab('adminPost')}
          >
            관리자 글
          </button>
          <button
            type="button"
            className={`admin-featured-tab ${bottomTab === 'banner' ? 'active' : ''}`}
            onClick={() => setBottomTab('banner')}
          >
            캐러셀 전용
          </button>
        </div>

        <div className="admin-featured-tab-body">
          {bottomTab === 'notice' || bottomTab === 'adminPost' ? (
            <NoticePicker
              key={bottomTab}
              mode={bottomTab}
              refreshKey={noticeRefreshKey}
              onReorder={load}
              onAction={(action, post) => {
                // Wrap the post into a slot-shaped object so we can reuse the
                // existing carousel card handlers (view/edit/delete modals).
                const fakeSlot = {
                  slot: null,
                  item: {
                    type: 'post',
                    featuredId: post.featuredId,
                    postId: post.id,
                    boardSlug: post.boardSlug,
                    title: post.title,
                    thumbnail: post.thumbnail,
                  },
                }
                handleCardAction(action, fakeSlot)
              }}
              onPick={post => {
                if (post.isFeatured) {
                  showToast('이미 캐러셀에 등록된 글입니다', 'default')
                  return
                }
                registerPost(post.id)
              }}
            />
          ) : (
            <BannerForm key={bannerFormKey} onSubmit={registerBanner} submitting={saving} />
          )}
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={!!viewConfirm}
        title="해당 글로 이동"
        message="새 탭에서 해당 게시글을 엽니다. 계속하시겠습니까?"
        confirmLabel="이동"
        onConfirm={confirmView}
        onCancel={() => setViewConfirm(null)}
      />
      <ConfirmModal
        open={!!deleteConfirm}
        title="캐러셀에서 제거"
        message="이 슬롯을 캐러셀에서 제거합니다. 되돌릴 수 없어요."
        confirmLabel="제거"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
      <ReplaceSlotModal
        open={!!pendingPost || !!pendingBanner}
        slots={slots}
        onCancel={() => { setPendingPost(null); setPendingBanner(null) }}
        onPick={replaceSlot}
      />
      <BannerEditModal
        open={!!bannerEdit}
        initial={bannerEdit?.slot?.item || null}
        onCancel={() => setBannerEdit(null)}
        onSave={saveBannerEdit}
        submitting={saving}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth, useRequireLogin } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import BoardSidebar from '../components/community/BoardSidebar'
import AuthorMenu from '../components/community/AuthorMenu'
import CommentList from '../components/community/CommentList'
import PollWidget from '../components/community/PollWidget'
import ConfirmModal from '../components/ConfirmModal'
import ReportModal from '../components/community/ReportModal'
import UserTierBadge from '../components/UserTierBadge'
import { isValidBoard, DEFAULT_BOARD } from '../components/community/boards'
import { fetchPost, deletePost, toggleReaction } from '../services/postApi'
import { submitReport } from '../services/reportApi'
import { avatarOf } from '../utils/avatar'
import { copyToClipboard } from '../utils/clipboard'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'

function formatDateTime(iso) {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`
}

export default function PostDetail() {
  const { boardId, postId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const formatError = useApiError()
  const showToast = useToast()
  const [post, setPost] = useState(null)
  const [myReaction, setMyReaction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [modDeleteOpen, setModDeleteOpen] = useState(false)
  const [modDeleteReason, setModDeleteReason] = useState('')
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    if (!isValidBoard(boardId)) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPost(postId)
      .then(({ post }) => {
        if (cancelled) return
        setPost(post)
        setMyReaction(post.myReaction || null)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [boardId, postId])

  const [reactPending, setReactPending] = useState(false)
  async function handleReact(type) {
    if (!user) { requireLogin(); return }
    if (reactPending) return
    setReactPending(true)
    try {
      const result = await toggleReaction(postId, type)
      setMyReaction(result.myReaction)
      setPost(p => p ? {
        ...p,
        likeCount: result.likeCount,
        dislikeCount: result.dislikeCount,
        myReaction: result.myReaction,
      } : p)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setReactPending(false)
    }
  }
  function openReport() {
    if (!user) { requireLogin(); return }
    setReportOpen(true)
  }

  async function handleShare() {
    const ok = await copyToClipboard(window.location.href)
    if (ok) showToast(t('community.shareCopied'), 'success')
    else showToast(t('community.shareFailed'), 'error')
  }

  async function submitPostReport({ reason, reasonCodes, imageUrls }) {
    try {
      await submitReport({
        targetType: 'post',
        targetId: Number(postId),
        reason,
        reasonCodes,
        imageUrls,
      })
      setReportOpen(false)
      showToast(t('community.report.done'), 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  async function handleDelete() {
    setDeleteConfirm(false)
    try {
      await deletePost(postId)
      navigate(`/community/${boardId}`)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(`${t('common.deleteError')}: ${formatError(err)}`, 'error')
    }
  }

  async function submitModDelete() {
    const reason = modDeleteReason.trim()
    if (!reason) return
    try {
      await deletePost(postId, { reason })
      setModDeleteOpen(false)
      setModDeleteReason('')
      navigate(`/community/${boardId}`)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(`${t('common.deleteError')}: ${formatError(err)}`, 'error')
    }
  }

  function handleEdit() {
    navigate(`/community/${boardId}/${postId}/edit`, { state: { fromDetail: true } })
  }

  if (!isValidBoard(boardId)) {
    return <Navigate to={`/community/${DEFAULT_BOARD}`} replace />
  }
  if (loading) {
    return (
      <div className="community-board">
        <BoardSidebar currentBoard={boardId} />
        <main className="board-main"><div className="board-placeholder">{t('common.loading')}</div></main>
      </div>
    )
  }
  if (error || !post) {
    return <Navigate to={`/community/${boardId}`} replace />
  }
  if (post.boardSlug && post.boardSlug !== boardId) {
    return <Navigate to={`/community/${post.boardSlug}/${post.id}`} replace />
  }

  const isOwn = user && post.userId === user.id

  return (
    <>
      <PostDetailBody
        post={post}
        boardId={boardId}
        isOwn={isOwn}
        canModerate={!!user && (user.role === 'admin' || user.role === 'mod')}
        myReaction={myReaction}
        reactPending={reactPending}
        onReact={handleReact}
        onReport={openReport}
        onEdit={handleEdit}
        onDelete={() => (isOwn ? setDeleteConfirm(true) : setModDeleteOpen(true))}
        onShare={handleShare}
        t={t}
      />
      <ConfirmModal
        open={deleteConfirm}
        message={t('common.deleteConfirm')}
        confirmLabel={t('community.action.delete')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
      <ReportModal
        open={reportOpen}
        onConfirm={submitPostReport}
        onCancel={() => setReportOpen(false)}
      />

      {modDeleteOpen && (
        <div className="modal-backdrop" onClick={() => setModDeleteOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">게시글 삭제</h2>
            <p className="modal-body">
              이 게시글을 삭제합니다. 작성자에게는 나중에 이메일로 삭제 사유가 전달됩니다.
            </p>
            <div className="modal-form">
              <label className="modal-field">
                <span className="modal-field-label">삭제 사유</span>
                <textarea
                  className="modal-input modal-textarea"
                  value={modDeleteReason}
                  onChange={e => setModDeleteReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="예: 커뮤니티 규칙 위반 - 광고성 게시물"
                  maxLength={500}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setModDeleteOpen(false)}>
                {t('community.action.cancel')}
              </button>
              <button
                type="button"
                className="modal-btn-danger"
                onClick={submitModDelete}
                disabled={!modDeleteReason.trim()}
              >
                {t('community.action.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function parseBody(html) {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body><div id="__r">${html}</div></body>`, 'text/html')
  const root = doc.getElementById('__r')
  if (!root) return [{ type: 'html', content: html }]
  const parts = []
  let buffer = ''
  function flush() {
    if (buffer) { parts.push({ type: 'html', content: buffer }); buffer = '' }
  }
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 1 && child.classList?.contains('post-poll')) {
      flush()
      parts.push({
        type: 'poll',
        question: child.getAttribute('data-question') || '',
        options: (child.getAttribute('data-options') || '').split('|').filter(Boolean),
      })
    } else if (child.nodeType === 1) {
      buffer += child.outerHTML
    } else if (child.nodeType === 3) {
      buffer += child.textContent
    }
  }
  flush()
  return parts
}

function PostDetailBody({ post, boardId, isOwn, canModerate, myReaction, reactPending, onReact, onReport, onEdit, onDelete, onShare, t }) {
  const bodyParts = useMemo(() => parseBody(post.body), [post.body])
  const liked = myReaction === 'like'
  const disliked = myReaction === 'dislike'
  const canDelete = isOwn || canModerate

  return (
    <div className="community-board">
      <BoardSidebar currentBoard={boardId} />

      <main className="board-main">
        <article className="post-detail">
          <div className="post-detail-board">
            <Link to={`/community/${boardId}`}>{t(`community.board.${boardId}`)}</Link>
          </div>

          <h1 className="post-detail-title">{post.title}</h1>

          <div className="post-detail-author-row">
            <Link to={`/user/${encodeURIComponent(post.author)}`} className="post-detail-author">
              <img src={avatarOf(post.authorAvatar)} alt="" className="post-detail-avatar" />
              <span className="post-detail-nickname">
                <UserTierBadge tier={post.authorTier} />
                {post.author}
              </span>
            </Link>
            <div className="post-detail-meta">
              <span>{formatDateTime(post.date)}</span>
              <span>·</span>
              <span>{t('community.col.views')} {post.views.toLocaleString()}</span>
              <AuthorMenu
                canEdit={isOwn}
                onEdit={isOwn ? onEdit : undefined}
                onDelete={canDelete ? onDelete : undefined}
                onShare={onShare}
              />
            </div>
          </div>

          <hr className="post-detail-hr" />

          <div className="post-detail-body">
            {bodyParts.map((part, i) => {
              if (part.type === 'poll') {
                return (
                  <div key={i} className="post-poll">
                    <PollWidget
                      postId={post.id}
                      question={part.question}
                      options={part.options}
                    />
                  </div>
                )
              }
              return <div key={i} dangerouslySetInnerHTML={{ __html: part.content }} />
            })}
          </div>

          <div className="post-detail-reactions">
            <div className="post-reaction-group">
              <button
                type="button"
                className={`post-react-btn post-like-btn ${liked ? 'active' : ''}`}
                onClick={() => onReact('like')}
                aria-pressed={liked}
                disabled={reactPending}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 10v12" />
                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.96 2.39l-1.4 7A2 2 0 0 1 18.43 21H7V10l4-7a1.98 1.98 0 0 1 4 2.88z" />
                </svg>
                <span>{post.likeCount}</span>
              </button>
              <button
                type="button"
                className={`post-react-btn post-dislike-btn ${disliked ? 'active' : ''}`}
                onClick={() => onReact('dislike')}
                aria-pressed={disliked}
                disabled={reactPending}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={disliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 14V2" />
                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.96-2.39l1.4-7A2 2 0 0 1 5.57 3H17v11l-4 7a1.98 1.98 0 0 1-4-2.88z" />
                </svg>
                <span>{post.dislikeCount || 0}</span>
              </button>
            </div>
            <button type="button" className="post-report-btn" onClick={onReport}>
              {t('community.action.report')}
            </button>
          </div>
        </article>

        <CommentList postId={post.id} />
      </main>
    </div>
  )
}

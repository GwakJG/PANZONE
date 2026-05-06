import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth, useRequireLogin } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import AuthorMenu from './AuthorMenu'
import ConfirmModal from '../ConfirmModal'
import ReportModal from './ReportModal'
import UserTierBadge from '../UserTierBadge'
import { fetchComments, createComment, deleteComment, updateComment } from '../../services/commentApi'
import { submitReport } from '../../services/reportApi'
import { uploadImage } from '../../services/uploadApi'
import { avatarOf } from '../../utils/avatar'
import { useApiError, isAuthError, isSuspendedError } from '../../hooks/useApiError'

function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.8" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function formatDateTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

function CommentItem({ comment, isReply = false, onReply, onDelete, onEdit, highlightedId }) {
  const { t } = useLanguage()
  const formatError = useApiError()
  const showToast = useToast()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const [showReplyBox, setShowReplyBox] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.text)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const isOwn = !!user && comment.userId === user.id

  function handleReplyToggle() {
    if (!user) { requireLogin(); return }
    setShowReplyBox(v => !v)
  }

  function openReport() {
    if (!user) { requireLogin(); return }
    setReportOpen(true)
  }

  async function submitCommentReport({ reason, reasonCodes, imageUrls }) {
    try {
      await submitReport({
        targetType: 'comment',
        targetId: comment.id,
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

  function handleEditToggle() {
    setEditText(comment.text)
    setEditing(true)
  }

  async function handleEditSave() {
    const text = editText.trim()
    if (!text || submitting) return
    if (text === comment.text) { setEditing(false); return }
    setSubmitting(true)
    try {
      await onEdit(comment.id, text)
      setEditing(false)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReplySubmit() {
    const text = replyText.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await onReply(comment.id, text)
      setReplyText('')
      setShowReplyBox(false)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setDeleteConfirm(false)
    try {
      await onDelete(comment.id)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(`${t('common.deleteError')}: ${formatError(err)}`, 'error')
    }
  }

  const isHighlighted = highlightedId === comment.id
  if (comment.deleted) {
    const tombstoneKey = comment.tombstoneReason === 'suspended'
      ? 'community.suspendedComment'
      : 'community.deletedComment'
    return (
      <li
        id={`comment-${comment.id}`}
        className={`comment-item ${isReply ? 'is-reply' : ''} comment-deleted ${isHighlighted ? 'comment-highlight' : ''}`}
      >
        <div className="comment-tombstone">{t(tombstoneKey)}</div>
        {comment.replies && comment.replies.length > 0 && (
          <ul className="comment-reply-list">
            {comment.replies.map(r => (
              <CommentItem key={r.id} comment={r} isReply onReply={onReply} onDelete={onDelete} onEdit={onEdit} highlightedId={highlightedId} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li
      id={`comment-${comment.id}`}
      className={`comment-item ${isReply ? 'is-reply' : ''} ${isHighlighted ? 'comment-highlight' : ''}`}
    >
      <div className="comment-row">
        <Link to={`/user/${encodeURIComponent(comment.author)}`} className="comment-avatar">
          <img src={avatarOf(comment.authorAvatar)} alt="" />
        </Link>
        <div className="comment-body">
          <div className="comment-head">
            <div className="comment-head-left">
              <Link to={`/user/${encodeURIComponent(comment.author)}`} className="comment-author">
                <UserTierBadge tier={comment.authorTier} />
                {comment.author}
              </Link>
              {comment.edited && (
                <span className="comment-edited-badge">({t('community.edited')})</span>
              )}
            </div>
            {isOwn && !editing && (
              <AuthorMenu canEdit onEdit={handleEditToggle} onDelete={() => setDeleteConfirm(true)} />
            )}
          </div>
          {editing ? (
            <div className="comment-edit-box">
              <textarea
                className="comment-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                maxLength={400}
                autoFocus
              />
              <div className="comment-edit-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setEditing(false)}
                  disabled={submitting}
                >
                  {t('community.action.cancel')}
                </button>
                <button
                  type="button"
                  className="comment-submit-btn"
                  onClick={handleEditSave}
                  disabled={submitting || !editText.trim()}
                >
                  {t('community.action.submit')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="comment-text">{comment.text}</div>
              {comment.image && (
                <img src={comment.image} alt="" className="comment-image" />
              )}
            </>
          )}
          <div className="comment-foot">
            <span className="comment-time">{formatDateTime(comment.date)}</span>
            {!isReply && (
              <button type="button" className="comment-reply-btn" onClick={handleReplyToggle}>
                {t('community.action.reply')}
              </button>
            )}
            <button type="button" className="comment-report-btn" onClick={openReport}>
              {t('community.action.report')}
            </button>
          </div>
          {showReplyBox && (
            <div className="comment-reply-box">
              <textarea
                className="comment-input"
                placeholder={t('community.replyPlaceholder')}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                maxLength={400}
              />
              <div className="comment-edit-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowReplyBox(false); setReplyText('') }}
                  disabled={submitting}
                >
                  {t('community.action.cancel')}
                </button>
                <button
                  type="button"
                  className="comment-submit-btn"
                  onClick={handleReplySubmit}
                  disabled={submitting || !replyText.trim()}
                >
                  {t('community.action.submit')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <ul className="comment-reply-list">
          {comment.replies.map(r => (
            <CommentItem key={r.id} comment={r} isReply onReply={onReply} onDelete={onDelete} onEdit={onEdit} highlightedId={highlightedId} />
          ))}
        </ul>
      )}
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
        onConfirm={submitCommentReport}
        onCancel={() => setReportOpen(false)}
      />
    </li>
  )
}

export default function CommentList({ postId }) {
  const { t } = useLanguage()
  const formatError = useApiError()
  const showToast = useToast()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [attachedImage, setAttachedImage] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [highlightedId, setHighlightedId] = useState(null)
  const fileInputRef = useRef(null)

  const load = useCallback(async () => {
    if (!postId) return
    try {
      const data = await fetchComments(postId)
      setComments(data.comments)
    } catch (err) {
      console.error('[comments]', err)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { load() }, [load])

  // Jump to + briefly highlight a specific comment when the URL carries
  // `#comment-:id` (used by the admin 신고 탭 deep-link). Runs once comments
  // finish loading. Highlight auto-clears after 3s so it doesn't persist on
  // subsequent navigations.
  useEffect(() => {
    if (loading || !comments.length) return
    const m = typeof window !== 'undefined' && window.location.hash.match(/^#comment-(\d+)/)
    if (!m) return
    const id = parseInt(m[1], 10)
    if (!Number.isFinite(id)) return
    // Defer to next tick so the DOM is in place.
    const rafId = requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedId(id)
      }
    })
    const tid = setTimeout(() => setHighlightedId(null), 3000)
    return () => { cancelAnimationFrame(rafId); clearTimeout(tid) }
  }, [loading, comments])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!user) { requireLogin(); return }
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setAttachedImage(url)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  function closeCompose() {
    setComposeOpen(false)
    setNewComment('')
    setAttachedImage(null)
  }

  async function handleSubmit() {
    const text = newComment.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await createComment({ postId, body: text, imageUrl: attachedImage || undefined })
      closeCompose()
      await load()
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReply(parentId, body) {
    await createComment({ postId, body, parentId })
    await load()
  }

  async function handleDelete(id) {
    await deleteComment(id)
    await load()
  }

  async function handleEdit(id, body) {
    await updateComment(id, { body })
    await load()
  }

  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)

  return (
    <section className="comment-section">
      <div className="comment-header">
        <h2 className="comment-title">
          {t('community.comments')} <span className="comment-count">{totalCount}</span>
        </h2>
        <button
          type="button"
          className="comment-toggle-btn"
          onClick={() => {
            if (composeOpen) { closeCompose(); return }
            if (!user) { requireLogin(); return }
            setComposeOpen(true)
          }}
          aria-expanded={composeOpen}
        >
          {composeOpen ? t('community.action.cancel') : t('community.action.writeComment')}
        </button>
      </div>

      {composeOpen && (
        <div className="comment-compose">
          <textarea
            className="comment-input"
            placeholder={t('community.commentPlaceholder')}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            maxLength={400}
            autoFocus
          />
          {attachedImage && (
            <div className="comment-attach-preview">
              <img src={attachedImage} alt="" />
              <button
                type="button"
                className="comment-attach-remove"
                onClick={() => setAttachedImage(null)}
                aria-label="remove"
              >
                ×
              </button>
            </div>
          )}
          <div className="comment-compose-foot">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="comment-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('community.action.attachImage')}
              title={t('community.action.attachImage')}
              disabled={uploading}
            >
              <IconImage />
              <span>{t('community.action.attachImage')}</span>
            </button>
            <button
              type="button"
              className="comment-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || uploading || !newComment.trim()}
            >
              {t('community.action.submit')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="board-placeholder">{t('common.loading')}</div>
      ) : (
        <ul className="comment-list">
          {comments.map(c => (
            <CommentItem
              key={c.id}
              comment={c}
              onReply={handleReply}
              onDelete={handleDelete}
              onEdit={handleEdit}
              highlightedId={highlightedId}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

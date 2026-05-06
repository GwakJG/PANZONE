import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useApiError, isAuthError, isSuspendedError } from '../../hooks/useApiError'
import WriteToolbar from '../../components/community/WriteToolbar'
import FontToolbar from '../../components/community/FontToolbar'
import UserTierBadge from '../../components/UserTierBadge'
import ConfirmModal from '../../components/ConfirmModal'
import { avatarOf } from '../../utils/avatar'
import { createPost } from '../../services/postApi'
import {
  broadcastNotice,
  fetchAdminBoards,
  fetchNoticeDraft,
  createNoticeDraft,
  updateNoticeDraft,
  deleteNoticeDraft,
} from '../../services/adminApi'

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Serialize contentEditable body, replacing any live poll editors with final
// post-poll markup (mirrors PostWrite so the output is byte-compatible).
function serializeBodyFromEditor(editor) {
  if (!editor) return ''
  const livePolls = Array.from(editor.querySelectorAll('.post-poll-draft'))
  const pollValues = livePolls.map(d => {
    const qEl = d.querySelector('.poll-editor-q')
    const q = (qEl?.value || '').trim()
    const opts = Array.from(d.querySelectorAll('.poll-editor-opt'))
      .map(i => (i.value || '').trim())
      .filter(Boolean)
    return { q, opts }
  })
  const clone = editor.cloneNode(true)
  const clonePolls = Array.from(clone.querySelectorAll('.post-poll-draft'))
  clonePolls.forEach((d, i) => {
    const { q, opts } = pollValues[i] || { q: '', opts: [] }
    if (!q || opts.length < 2) { d.parentNode?.removeChild(d); return }
    const finalDiv = document.createElement('div')
    finalDiv.className = 'post-poll'
    finalDiv.setAttribute('contenteditable', 'false')
    finalDiv.setAttribute('data-question', q)
    finalDiv.setAttribute('data-options', opts.join('|'))
    const qDiv = document.createElement('div')
    qDiv.className = 'post-poll-q'
    qDiv.innerHTML = '<svg class="post-poll-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="19" x2="5" y2="13"/><line x1="12" y1="19" x2="12" y2="5"/><line x1="19" y1="19" x2="19" y2="10"/></svg>'
    qDiv.appendChild(document.createTextNode(q))
    const ul = document.createElement('ul')
    ul.className = 'post-poll-opts'
    for (const o of opts) {
      const li = document.createElement('li')
      li.textContent = o
      ul.appendChild(li)
    }
    finalDiv.appendChild(qDiv)
    finalDiv.appendChild(ul)
    d.parentNode.replaceChild(finalDiv, d)
  })
  return clone.innerHTML
}

// Split serialized HTML into [{type:'html', content}, {type:'poll', question, options}...]
// so the preview renders polls with their real structure (mirrors PostDetail's parseBody).
function parseBodyForPreview(html) {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body><div id="__r">${html}</div></body>`, 'text/html')
  const root = doc.getElementById('__r')
  if (!root) return [{ type: 'html', content: html }]
  const parts = []
  let buffer = ''
  const flush = () => { if (buffer) { parts.push({ type: 'html', content: buffer }); buffer = '' } }
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

function formatDateTime(iso) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${dd} ${hh}:${mm}`
}

export default function AdminNoticeWrite() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const showToast = useToast()
  const formatError = useApiError()
  const editorRef = useRef(null)

  // Input sources: either new write (boardSlugs from state) or editing an existing draft (draftId).
  const initialBoardSlugs = Array.isArray(location.state?.boardSlugs) ? location.state.boardSlugs : []
  const draftId = location.state?.draftId || null

  const [boardSlugs, setBoardSlugs] = useState(initialBoardSlugs)
  const [boards, setBoards] = useState([])
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [currentDraftId, setCurrentDraftId] = useState(draftId)
  const [loading, setLoading] = useState(!!draftId)
  const [submitting, setSubmitting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewParts, setPreviewParts] = useState([])
  const [cancelConfirm, setCancelConfirm] = useState(false)

  // Nothing to work with — bounce back to the list.
  useEffect(() => {
    if (!boardSlugs.length && !draftId) {
      navigate('/admin/notices', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch board metadata so we can show names in the target chips.
  useEffect(() => {
    let cancelled = false
    fetchAdminBoards()
      .then(data => { if (!cancelled) setBoards(data.boards) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [])

  // Load an existing draft. We defer setting the editor's innerHTML to a
  // separate effect that runs after loading completes — otherwise the
  // contentEditable div isn't in the DOM yet and the assignment is lost.
  const [pendingBody, setPendingBody] = useState(null)
  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    fetchNoticeDraft(draftId)
      .then(({ draft }) => {
        if (cancelled) return
        setTitle(draft.title || '')
        setBodyHtml(draft.body || '')
        setBoardSlugs(draft.boardSlugs || [])
        setPendingBody(draft.body || '')
      })
      .catch(err => {
        showToast(formatError(err), 'error')
        navigate('/admin/notices', { replace: true })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId])

  // Push the loaded body into the contentEditable div once it's mounted.
  useEffect(() => {
    if (loading) return
    if (pendingBody === null) return
    if (editorRef.current) editorRef.current.innerHTML = pendingBody
    setPendingBody(null)
  }, [loading, pendingBody])

  const dirty = !submitting && !loading && (title.trim() || bodyHtml.trim())

  useEffect(() => {
    if (!dirty) return
    function handler(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // --- Editor plumbing ---

  function syncBody() {
    setBodyHtml(editorRef.current?.innerHTML || '')
  }

  function insertHtml(html) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    const temp = document.createElement('div')
    temp.innerHTML = html
    const nodes = Array.from(temp.childNodes)
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      let last = null
      for (const node of nodes) {
        range.insertNode(node)
        last = node
        range.setStartAfter(node)
      }
      if (last) {
        const newRange = document.createRange()
        newRange.setStartAfter(last)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)
      }
    } else {
      for (const node of nodes) editor.appendChild(node)
    }
    syncBody()
  }

  function handleInsert(type, payload) {
    switch (type) {
      case 'image':
        insertHtml(`<img src="${payload}" alt="" style="max-width:100%;border-radius:4px;" /><p><br/></p>`)
        break
      case 'video':
        insertHtml(`<video src="${payload}" controls style="max-width:100%;border-radius:4px;"></video><p><br/></p>`)
        break
      case 'hr':
        insertHtml('<hr/><p><br/></p>')
        break
      case 'file': {
        const { name, size } = payload
        const kb = (size / 1024).toFixed(1)
        insertHtml(`<div class="write-file-chip">📎 ${escapeHtml(name)} <small>(${kb} KB)</small></div><p><br/></p>`)
        break
      }
      case 'link': {
        const { url, text } = payload
        insertHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`)
        break
      }
      case 'table': {
        const { rows, cols } = payload
        let html = '<table class="write-table"><tbody>'
        for (let r = 0; r < rows; r++) {
          html += '<tr>'
          for (let c = 0; c < cols; c++) html += '<td><br/></td>'
          html += '</tr>'
        }
        html += '</tbody></table><p><br/></p>'
        insertHtml(html)
        break
      }
      case 'poll': {
        const qPh = escapeHtml(t('community.write.pollQuestionPlaceholder'))
        const opt1 = escapeHtml(t('community.write.pollOptionPlaceholder').replace('{n}', '1'))
        const opt2 = escapeHtml(t('community.write.pollOptionPlaceholder').replace('{n}', '2'))
        const addLabel = escapeHtml(t('community.write.pollAddOption'))
        const html = `<div class="post-poll-draft" contenteditable="false"><div class="poll-editor"><input type="text" class="poll-editor-q" placeholder="${qPh}" maxlength="80"><ul class="poll-editor-opts"><li><input type="text" class="poll-editor-opt" placeholder="${opt1}" maxlength="40"></li><li><input type="text" class="poll-editor-opt" placeholder="${opt2}" maxlength="40"></li></ul><button type="button" class="poll-editor-add">+ ${addLabel}</button></div></div><p><br/></p>`
        insertHtml(html)
        break
      }
      default: break
    }
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    function onClick(e) {
      const addBtn = e.target.closest('.poll-editor-add')
      if (addBtn && editor.contains(addBtn)) {
        e.preventDefault()
        const opts = addBtn.previousElementSibling
        if (!opts || !opts.classList.contains('poll-editor-opts')) return
        const n = opts.children.length
        if (n >= 6) return
        const li = document.createElement('li')
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'poll-editor-opt'
        input.placeholder = t('community.write.pollOptionPlaceholder').replace('{n}', String(n + 1))
        input.maxLength = 40
        li.appendChild(input)
        if (n >= 2) {
          const rm = document.createElement('button')
          rm.type = 'button'
          rm.className = 'poll-editor-remove'
          rm.textContent = '×'
          li.appendChild(rm)
        }
        opts.appendChild(li)
        input.focus()
        return
      }
      const rmBtn = e.target.closest('.poll-editor-remove')
      if (rmBtn && editor.contains(rmBtn)) {
        e.preventDefault()
        const li = rmBtn.closest('li')
        const ul = li?.parentElement
        if (!ul || ul.children.length <= 2) return
        li.remove()
      }
    }
    editor.addEventListener('click', onClick)
    return () => editor.removeEventListener('click', onClick)
  }, [t])

  // --- 임시저장 (draft save) ---

  async function handleSaveDraft() {
    const body = serializeBodyFromEditor(editorRef.current)
    if (!title.trim() && !body.trim()) {
      showToast('제목이나 본문 중 하나는 있어야 저장할 수 있어요', 'error')
      return
    }
    if (!boardSlugs.length) {
      showToast('게시 대상 게시판이 필요합니다', 'error')
      return
    }
    setSubmitting(true)
    try {
      if (currentDraftId) {
        await updateNoticeDraft(currentDraftId, { title: title.trim(), body, boardSlugs })
      } else {
        const { id } = await createNoticeDraft({ title: title.trim(), body, boardSlugs })
        setCurrentDraftId(id)
      }
      showToast('임시저장했습니다', 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // --- 게시 (publish) ---

  async function handleSubmit() {
    if (!title.trim()) { showToast('제목을 입력해주세요', 'error'); return }
    const body = serializeBodyFromEditor(editorRef.current)
    if (!body.trim()) { showToast('본문을 입력해주세요', 'error'); return }
    if (!boardSlugs.length) { showToast('게시 대상 게시판이 필요합니다', 'error'); return }
    setSubmitting(true)
    try {
      if (boardSlugs.length === 1) {
        await createPost({ boardSlug: boardSlugs[0], title: title.trim(), body, isPinned: true })
      } else {
        await broadcastNotice({ boardSlugs, title: title.trim(), body, isPinned: true })
      }
      // Drop the backing draft once the published posts exist.
      if (currentDraftId) {
        await deleteNoticeDraft(currentDraftId).catch(() => {})
      }
      showToast('공지를 게시했습니다', 'success')
      navigate('/admin/notices')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) {
        showToast(formatError(err), 'error')
      }
      setSubmitting(false)
    }
  }

  function handleCancel() {
    if (dirty) setCancelConfirm(true)
    else navigate('/admin/notices')
  }

  // --- Preview ---

  function openPreview() {
    const html = serializeBodyFromEditor(editorRef.current?.cloneNode(true))
    setBodyHtml(editorRef.current?.innerHTML || '')
    setPreviewParts(parseBodyForPreview(html))
    setPreviewOpen(true)
  }

  const boardNameBySlug = useMemo(
    () => new Map(boards.map(b => [b.slug, b.name])),
    [boards]
  )

  if (loading) {
    return <div className="admin-page"><div className="admin-users-placeholder">불러오는 중...</div></div>
  }

  return (
    <div className="admin-page admin-notice-write">
      <div className="admin-notices-head">
        <h1 className="admin-page-title">공지 작성</h1>
        <div className="admin-notice-write-head-actions">
          <button type="button" className="btn-cancel" onClick={handleCancel} disabled={submitting}>취소</button>
        </div>
      </div>

      <div className="admin-notice-write-target">
        <span className="admin-field-label">게시 대상</span>
        <div className="admin-notice-write-boards">
          {boardSlugs.map(slug => (
            <span key={slug} className="admin-notice-write-board-chip">
              {boardNameBySlug.get(slug) || slug}
            </span>
          ))}
          {boardSlugs.length > 1 && (
            <span className="admin-notice-write-broadcast-tag">
              {boardSlugs.length}개 게시판 동시 게시
            </span>
          )}
        </div>
      </div>

      <article className="post-write admin-notice-write-editor">
        <input
          type="text"
          className="post-write-title"
          placeholder={t('community.write.titlePlaceholder')}
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={40}
          disabled={submitting}
        />

        <WriteToolbar onInsert={handleInsert} />
        <FontToolbar editorRef={editorRef} />

        <div
          ref={editorRef}
          className="post-write-body"
          contentEditable={!submitting}
          suppressContentEditableWarning
          data-placeholder={t('community.write.bodyPlaceholder')}
          onInput={syncBody}
        />

        <div className="post-write-footer">
          <button type="button" className="btn-cancel" onClick={openPreview} disabled={submitting}>
            미리보기
          </button>
          <button
            type="button"
            className="btn-cancel"
            onClick={handleSaveDraft}
            disabled={submitting}
          >
            임시저장
          </button>
          <button
            type="button"
            className="board-write-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '게시 중...' : '게시'}
          </button>
        </div>
      </article>

      {previewOpen && (
        <div className="modal-backdrop" onClick={() => setPreviewOpen(false)}>
          <div className="modal-card admin-notice-preview" onClick={e => e.stopPropagation()}>
            <div className="admin-notice-preview-head">
              <span className="admin-notice-preview-label">미리보기</span>
              <button type="button" className="btn-cancel" onClick={() => setPreviewOpen(false)}>닫기</button>
            </div>
            <article className="post-detail admin-notice-preview-article">
              {boardSlugs.length > 0 && (
                <div className="post-detail-board">
                  {boardSlugs.map(slug => boardNameBySlug.get(slug) || slug).join(' · ')}
                </div>
              )}
              <h1 className="post-detail-title">{title || '(제목 없음)'}</h1>
              <div className="post-detail-author-row">
                <div className="post-detail-author">
                  <img src={avatarOf(user?.avatarUrl)} alt="" className="post-detail-avatar" />
                  <span className="post-detail-nickname">
                    <UserTierBadge tier={4} />
                    {user?.name || '관리자'}
                  </span>
                </div>
                <div className="post-detail-meta">
                  <span>{formatDateTime(new Date())}</span>
                  <span>·</span>
                  <span>조회 0</span>
                </div>
              </div>
              <hr className="post-detail-hr" />
              <div className="post-detail-body">
                {previewParts.length === 0 && <p>(본문 없음)</p>}
                {previewParts.map((part, i) => {
                  if (part.type === 'poll') {
                    return (
                      <div key={i} className="post-poll">
                        <div className="post-poll-q">{part.question}</div>
                        <ul className="post-poll-opts">
                          {part.options.map((o, j) => <li key={j}>{o}</li>)}
                        </ul>
                      </div>
                    )
                  }
                  return <div key={i} dangerouslySetInnerHTML={{ __html: part.content }} />
                })}
              </div>
            </article>
          </div>
        </div>
      )}

      <ConfirmModal
        open={cancelConfirm}
        title="작성 취소"
        message="작성 중인 내용이 모두 사라집니다. 임시저장하지 않은 변경사항은 복구할 수 없어요."
        confirmLabel="취소하기"
        variant="danger"
        onConfirm={() => navigate('/admin/notices')}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  )
}

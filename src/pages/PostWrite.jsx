import { useEffect, useRef, useState } from 'react'
import { useParams, Navigate, useNavigate, useBlocker, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth, useRequireLogin } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import BoardSidebar from '../components/community/BoardSidebar'
import WriteToolbar from '../components/community/WriteToolbar'
import FontToolbar from '../components/community/FontToolbar'
import ConfirmModal from '../components/ConfirmModal'
import {
  isValidBoard,
  canWrite,
  DEFAULT_BOARD,
  hasTabs,
  isValidTab,
  BOARD_TABS,
} from '../components/community/boards'
import { createPost, fetchPost, updatePost } from '../services/postApi'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default function PostWrite() {
  const { boardId, postId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromDetail = !!location.state?.fromDetail
  const { t } = useLanguage()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const formatError = useApiError()
  const showToast = useToast()
  const editorRef = useRef(null)
  const isAdmin = !!user && (user.role === 'admin' || user.role === 'mod')
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [pinned, setPinned] = useState(false)
  const [subcategory, setSubcategory] = useState('')
  const [initial, setInitial] = useState({ title: '', body: '', pinned: false, subcategory: '' })
  const [loading, setLoading] = useState(!!postId)
  const [submitting, setSubmitting] = useState(false)
  const skipBlockRef = useRef(false)
  const isEdit = !!postId
  const boardHasTabs = hasTabs(boardId)
  const dirty = isEdit && !loading && (
    title !== initial.title ||
    bodyHtml !== initial.body ||
    (isAdmin && pinned !== initial.pinned) ||
    (boardHasTabs && subcategory !== initial.subcategory)
  )

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    fetchPost(postId)
      .then(({ post }) => {
        if (cancelled) return
        // Admin can edit any post; non-admin only their own.
        const canEdit = !!user && (post.userId === user.id || user.role === 'admin' || user.role === 'mod')
        if (!canEdit) {
          skipBlockRef.current = true
          navigate(`/community/${boardId}/${postId}`, { replace: true })
          return
        }
        const body = post.body || ''
        const sub = boardHasTabs && isValidTab(boardId, post.subcategory) ? post.subcategory : ''
        setTitle(post.title)
        setBodyHtml(body)
        setPinned(!!post.pinned)
        setSubcategory(sub)
        setInitial({ title: post.title, body, pinned: !!post.pinned, subcategory: sub })
        if (editorRef.current) editorRef.current.innerHTML = body
      })
      .catch(() => {
        skipBlockRef.current = true
        navigate(`/community/${boardId}`, { replace: true })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isEdit, postId, boardId, user, navigate])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skipBlockRef.current) return false
    if (!dirty) return false
    return currentLocation.pathname !== nextLocation.pathname
  })


  useEffect(() => {
    if (!dirty) return
    function handler(e) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

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

  // Admins can write to read-only boards (notice, patch) too.
  if (!isValidBoard(boardId) || (!canWrite(boardId) && !isAdmin)) {
    return <Navigate to={`/community/${DEFAULT_BOARD}`} replace />
  }

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

  function leaveToDetail(targetId) {
    skipBlockRef.current = true
    if (fromDetail) {
      navigate(-1)
    } else {
      navigate(`/community/${boardId}/${targetId}`, { replace: true })
    }
  }

  function serializeBody() {
    const editor = editorRef.current
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

  async function handleSubmit() {
    if (!user) { requireLogin(); return }
    const body = serializeBody()
    if (!title.trim() || !body.trim()) return
    if (boardHasTabs && !isValidTab(boardId, subcategory)) {
      showToast(t('community.boardTabs.pickerRequired'), 'error')
      return
    }
    setSubmitting(true)
    try {
      if (isEdit) {
        const payload = { title, body }
        if (isAdmin) payload.isPinned = pinned
        if (boardHasTabs) payload.subcategory = subcategory
        await updatePost(postId, payload)
        leaveToDetail(postId)
      } else {
        const payload = { boardSlug: boardId, title, body }
        if (isAdmin) payload.isPinned = pinned
        if (boardHasTabs) payload.subcategory = subcategory
        const { id } = await createPost(payload)
        skipBlockRef.current = true
        navigate(`/community/${boardId}/${id}`)
      }
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(`${t('common.saveError')}: ${formatError(err)}`, 'error')
      setSubmitting(false)
    }
  }

  function handleCancel() {
    if (fromDetail) {
      navigate(-1)
    } else {
      navigate(`/community/${boardId}/${postId}`, { replace: true })
    }
  }

  return (
    <div className="community-board">
      <BoardSidebar currentBoard={boardId} />

      <main className="board-main">
        <article className="post-write">
          {boardHasTabs && (
            <div className="post-write-category">
              <label className="post-write-category-label" htmlFor="post-write-category-select">
                {t('community.boardTabs.pickerLabel')}
              </label>
              <select
                id="post-write-category-select"
                className="post-write-category-select"
                value={subcategory}
                onChange={e => setSubcategory(e.target.value)}
                disabled={loading || submitting}
              >
                <option value="">{t('community.boardTabs.pickerPlaceholder')}</option>
                {BOARD_TABS[boardId].map(key => (
                  <option key={key} value={key}>
                    {t(`community.boardTabs.${boardId}.${key}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            type="text"
            className="post-write-title"
            placeholder={t('community.write.titlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={40}
            disabled={loading}
          />

          <WriteToolbar onInsert={handleInsert} />
          <FontToolbar editorRef={editorRef} />

          <div
            ref={editorRef}
            className="post-write-body"
            contentEditable={!loading}
            suppressContentEditableWarning
            data-placeholder={t('community.write.bodyPlaceholder')}
            onInput={syncBody}
          />


          <div className="post-write-footer">
            {isAdmin && (
              <label className="post-write-pin">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={e => setPinned(e.target.checked)}
                  disabled={submitting || loading}
                />
                <span>공지로 고정</span>
              </label>
            )}
            <button
              type="button"
              className="board-write-btn"
              onClick={handleSubmit}
              disabled={submitting || loading}
            >
              {t('community.action.submit')}
            </button>
            {isEdit && (
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCancel}
                disabled={submitting}
              >
                {t('community.action.cancel')}
              </button>
            )}
          </div>
        </article>
      </main>

      <ConfirmModal
        open={blocker.state === 'blocked'}
        message={t('community.write.cancelEditConfirm')}
        variant="danger"
        onConfirm={() => blocker.proceed()}
        onCancel={() => blocker.reset()}
      />
    </div>
  )
}

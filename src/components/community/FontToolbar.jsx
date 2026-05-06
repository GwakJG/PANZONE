import { useRef, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import LinkInsertModal from './LinkInsertModal'

function exec(cmd, value) {
  document.execCommand(cmd, false, value)
}

const PARAGRAPH_STYLES = [
  { value: 'p', labelKey: 'community.write.para.body' },
  { value: 'h1', labelKey: 'community.write.para.h1' },
  { value: 'h2', labelKey: 'community.write.para.h2' },
  { value: 'h3', labelKey: 'community.write.para.h3' },
]

const FONT_FAMILIES = [
  { value: 'inherit', labelKey: 'community.write.font.default' },
  { value: 'serif', labelKey: 'community.write.font.serif' },
  { value: 'monospace', labelKey: 'community.write.font.mono' },
]

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32]

export default function FontToolbar({ editorRef }) {
  const { t } = useLanguage()
  const [linkOpen, setLinkOpen] = useState(false)
  const savedRangeRef = useRef(null)

  function preserveSelection(fn) {
    return e => {
      e.preventDefault()
      editorRef.current?.focus()
      fn()
    }
  }

  function applyParagraph(e) {
    const tag = e.target.value
    editorRef.current?.focus()
    exec('formatBlock', tag)
  }

  function applyFont(e) {
    editorRef.current?.focus()
    exec('fontName', e.target.value)
  }

  function applySize(e) {
    editorRef.current?.focus()
    const px = e.target.value
    // execCommand fontSize uses 1-7 scale; wrap in span for px precision
    exec('fontSize', 4)
    const selection = window.getSelection()
    if (!selection.rangeCount) return
    const fonts = editorRef.current.querySelectorAll('font[size="4"]')
    fonts.forEach(f => {
      const span = document.createElement('span')
      span.style.fontSize = px + 'px'
      while (f.firstChild) span.appendChild(f.firstChild)
      f.replaceWith(span)
    })
  }

  function applyHighlight(e) {
    editorRef.current?.focus()
    exec('hiliteColor', e.target.value)
  }

  function openLinkModal() {
    const sel = window.getSelection()
    savedRangeRef.current = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    setLinkOpen(true)
  }

  function handleLinkConfirm({ url }) {
    setLinkOpen(false)
    editorRef.current?.focus()
    const range = savedRangeRef.current
    if (range) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
    exec('createLink', url)
    savedRangeRef.current = null
  }

  function handleLinkCancel() {
    setLinkOpen(false)
    savedRangeRef.current = null
  }

  return (
    <div className="write-toolbar write-toolbar-font">
      <select className="write-select" onChange={applyParagraph} defaultValue="p" onMouseDown={e => e.stopPropagation()}>
        {PARAGRAPH_STYLES.map(p => (
          <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
        ))}
      </select>

      <select className="write-select" onChange={applyFont} defaultValue="inherit">
        {FONT_FAMILIES.map(f => (
          <option key={f.value} value={f.value}>{t(f.labelKey)}</option>
        ))}
      </select>

      <select className="write-select write-select-sm" onChange={applySize} defaultValue="15">
        {FONT_SIZES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="write-toolbar-divider" />

      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('bold'))} title={t('community.write.bold')}>
        <b>B</b>
      </button>
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('italic'))} title={t('community.write.italic')}>
        <i>I</i>
      </button>
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('underline'))} title={t('community.write.underline')}>
        <u>U</u>
      </button>
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('strikeThrough'))} title={t('community.write.strike')}>
        <s>S</s>
      </button>

      <div className="write-toolbar-divider" />

      <label className="write-color-wrap" title={t('community.write.fontColor')}>
        <span className="write-color-label">A</span>
        <input type="color" className="write-color" defaultValue="#f6ac00" onChange={e => { editorRef.current?.focus(); exec('foreColor', e.target.value) }} />
      </label>
      <label className="write-color-wrap" title={t('community.write.bgColor')}>
        <span className="write-color-label write-color-label-bg">A</span>
        <input type="color" className="write-color" defaultValue="#3b82f6" onChange={applyHighlight} />
      </label>

      <div className="write-toolbar-divider" />

      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('justifyLeft'))} title={t('community.write.alignLeft')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
      </button>
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('justifyCenter'))} title={t('community.write.alignCenter')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>
      </button>
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(() => exec('justifyRight'))} title={t('community.write.alignRight')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/></svg>
      </button>

      <div className="write-toolbar-divider" />

      <label className="write-color-wrap" title={t('community.write.highlight')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <input type="color" className="write-color" defaultValue="#fff59d" onChange={applyHighlight} />
      </label>

      {/* eslint-disable-next-line react-hooks/refs -- preserveSelection returns an event handler that accesses the ref at call time, not at render. */}
      <button type="button" className="write-tool-btn-sq" onMouseDown={preserveSelection(openLinkModal)} title={t('community.write.tool.link')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
      </button>

      <LinkInsertModal
        open={linkOpen}
        withText={false}
        onConfirm={handleLinkConfirm}
        onCancel={handleLinkCancel}
      />
    </div>
  )
}

import { useRef, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { uploadImage } from '../../services/uploadApi'
import { useApiError, isAuthError, isSuspendedError } from '../../hooks/useApiError'
import LinkInsertModal from './LinkInsertModal'
import TableInsertModal from './TableInsertModal'

function Icon({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  )
}

const ICONS = {
  photo: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.8" /><path d="M21 15l-5-5L5 21" /></>,
  video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 10l5-3v10l-5-3z" /></>,
  hr: <><line x1="4" y1="12" x2="20" y2="12" /></>,
  file: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></>,
  poll: <><line x1="5" y1="19" x2="5" y2="13" /><line x1="12" y1="19" x2="12" y2="5" /><line x1="19" y1="19" x2="19" y2="10" /></>,
}

export default function WriteToolbar({ onInsert }) {
  const { t } = useLanguage()
  const formatError = useApiError()
  const showToast = useToast()
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)

  async function handleImage(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadImage(f)
      onInsert('image', url)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  function handleVideo(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    onInsert('video', url)
    e.target.value = ''
  }

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    onInsert('file', { name: f.name, size: f.size })
    e.target.value = ''
  }

  function handleLinkConfirm({ url, text }) {
    setLinkOpen(false)
    onInsert('link', { url, text })
  }

  function handleTableConfirm({ rows, cols }) {
    setTableOpen(false)
    onInsert('table', { rows, cols })
  }

  function handlePoll() {
    onInsert('poll')
  }

  const tools = [
    { id: 'photo', label: t('community.write.tool.photo'), icon: ICONS.photo, onClick: () => imageInputRef.current?.click() },
    { id: 'video', label: t('community.write.tool.video'), icon: ICONS.video, onClick: () => videoInputRef.current?.click() },
    { id: 'hr', label: t('community.write.tool.hr'), icon: ICONS.hr, onClick: () => onInsert('hr') },
    { id: 'file', label: t('community.write.tool.file'), icon: ICONS.file, onClick: () => fileInputRef.current?.click() },
    { id: 'link', label: t('community.write.tool.link'), icon: ICONS.link, onClick: () => setLinkOpen(true) },
    { id: 'table', label: t('community.write.tool.table'), icon: ICONS.table, onClick: () => setTableOpen(true) },
    { id: 'poll', label: t('community.write.tool.poll'), icon: ICONS.poll, onClick: handlePoll },
  ]

  return (
    <div className="write-toolbar write-toolbar-insert">
      {tools.map(tool => (
        <button
          key={tool.id}
          type="button"
          className="write-tool-btn"
          onMouseDown={e => e.preventDefault()}
          onClick={tool.onClick}
          title={tool.label}
          disabled={uploading && tool.id === 'photo'}
        >
          <Icon d={tool.icon} />
          <span className="write-tool-label">{tool.label}</span>
        </button>
      ))}
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImage} />
      <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideo} />
      <input ref={fileInputRef} type="file" hidden onChange={handleFile} />

      <LinkInsertModal
        open={linkOpen}
        withText={true}
        onConfirm={handleLinkConfirm}
        onCancel={() => setLinkOpen(false)}
      />
      <TableInsertModal
        open={tableOpen}
        onConfirm={handleTableConfirm}
        onCancel={() => setTableOpen(false)}
      />
    </div>
  )
}

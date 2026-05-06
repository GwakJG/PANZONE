function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function Highlight({ text, query }) {
  if (!text) return null
  const q = (query || '').trim()
  if (!q) return text
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : <span key={i}>{part}</span>
  )
}

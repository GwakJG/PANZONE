// Reliable clipboard write that works in:
// - Modern browsers on HTTPS (navigator.clipboard.writeText)
// - Localhost without HTTPS (navigator.clipboard may fail → fallback)
// - Older browsers / insecure contexts (document.execCommand('copy'))
// Returns true on success, false otherwise. Caller shows the toast.
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy path
    }
  }

  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.width = '1px'
  ta.style.height = '1px'
  ta.style.padding = '0'
  ta.style.border = 'none'
  ta.style.outline = 'none'
  ta.style.boxShadow = 'none'
  ta.style.background = 'transparent'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  const prevActive = document.activeElement
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  if (prevActive && typeof prevActive.focus === 'function') {
    try { prevActive.focus() } catch { /* ignore */ }
  }
  return ok
}

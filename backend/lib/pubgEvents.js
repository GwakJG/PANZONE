// Sync PUBG official events into the `event` board.
//
// Two stages, mirroring the patch-notes pattern:
//   1) LIST:   api-foc.krafton.com/content/post/events  → {postId, title, dates, images}
//   2) DETAIL: pubg.com/ko/events/notice/<postId>       → NUXT JSON has full body HTML
//
// pubg.com's events list page is SPA, but its underlying Krafton CMS API is
// reachable directly with two service headers (discovered in the page JS bundle).

const LIST_URL = 'https://api-foc.krafton.com/content/post/events'
const DETAIL_URL = id => `https://pubg.com/ko/events/notice/${id}`

const SERVICE_HEADERS = {
  'Service-Namespace': 'PUBG_OFFICIAL',
  'Service-Game': 'pubg',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PUBGOP-Sync/1.0',
}

// One page of events. period: 'PROGRESS' | 'COMPLETE' | 'ALL'.
async function fetchEventList({ period = 'PROGRESS', size = 20, page = 1, lang = 'ko' } = {}) {
  const params = new URLSearchParams({
    lang, displayLocationType: 'NORMAL', category: 'event', period, size: String(size), page: String(page),
  })
  const res = await fetch(`${LIST_URL}?${params}`, { headers: SERVICE_HEADERS })
  if (!res.ok) throw new Error(`Krafton CMS HTTP ${res.status}`)
  const json = await res.json()
  const items = json?._embedded?.post || []
  const totalPages = json?.page?.totalPages || 1
  return { items, totalPages, totalElements: json?.page?.totalElements || items.length }
}

// Walk every page so we don't miss anything when `size` < total.
async function fetchAllEvents(opts = {}) {
  const out = []
  let page = 1
  while (true) {
    const { items, totalPages } = await fetchEventList({ ...opts, page })
    out.push(...items)
    if (page >= totalPages) break
    page++
  }
  return out
}

// Detail body — pulled from the NUXT hydration JSON on the event page (the
// page's contentElement DOM is empty since the page is a SPA shell).
async function fetchEventBodyHtml(postId) {
  const res = await fetch(DETAIL_URL(postId), {
    headers: {
      'User-Agent': SERVICE_HEADERS['User-Agent'],
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6',
    },
  })
  if (!res.ok) throw new Error(`event detail HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/window\.__NUXT__=([\s\S]*?);<\/script>/)
  if (!m) throw new Error('NUXT hydration block not found')

  // The hydration code is a self-invoking function; eval it in our scope.
  // No external input lands here — the URL is fixed and Krafton-controlled.
  // eslint-disable-next-line no-eval
  const nuxt = eval('(' + m[1] + ')')
  const body = findEventContent(nuxt)
  if (!body) throw new Error('event body not found in NUXT data')
  return body
}

function findEventContent(node) {
  if (typeof node === 'string') {
    if (node.length > 200 && /<(p|h\d|div|img)/.test(node)) return node
    return null
  }
  if (node && typeof node === 'object') {
    // Prefer the canonical path when present.
    if (node.eventDetail?.post?.contents?.[0]?.content) return node.eventDetail.post.contents[0].content
    if (node.postDetail?.contents?.[0]?.content) return node.postDetail.contents[0].content
    if (node.postDetailContent?.content) return node.postDetailContent.content
    for (const k in node) {
      const r = findEventContent(node[k])
      if (r) return r
    }
  }
  return null
}

const DROP_TAGS = ['script', 'style', 'noscript', 'iframe', 'link', 'meta']
const ATTR_ALLOW = {
  a: ['href'],
  img: ['src', 'alt'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  colgroup: ['span'],
}

function safeUrl(u) {
  const v = String(u || '').trim()
  if (!/^https?:\/\//i.test(v)) return null
  return v.replace(/[\s"'<>`]/g, '')
}

function sanitize(html) {
  let s = String(html)
  for (const tag of DROP_TAGS) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tagRaw, attrsRaw) => {
    const tag = tagRaw.toLowerCase()
    const isClose = full.startsWith('</')
    if (isClose) return `</${tag}>`
    const selfClose = /\/\s*$/.test(attrsRaw)
    const allow = ATTR_ALLOW[tag] || []
    const kept = []
    if (allow.length) {
      const attrRe = /([a-zA-Z_:][\w:.\-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g
      let am
      while ((am = attrRe.exec(attrsRaw))) {
        const name = am[1].toLowerCase()
        if (!allow.includes(name)) continue
        let val = am[2]
        if (val[0] === '"' || val[0] === "'") val = val.slice(1, -1)
        if ((name === 'href' || name === 'src')) {
          const safe = safeUrl(val)
          if (!safe) continue
          val = safe
        }
        kept.push(`${name}="${val.replace(/"/g, '&quot;')}"`)
      }
    }
    if (tag === 'a') kept.push('target="_blank"', 'rel="noopener noreferrer"')
    const inside = kept.length ? ' ' + kept.join(' ') : ''
    return `<${tag}${inside}${selfClose ? ' /' : ''}>`
  })

  s = s.replace(/<p>\s*<\/p>/g, '')
  s = s.replace(/<span>([\s\S]*?)<\/span>/g, '$1')
  s = s.replace(/(<br\s*\/?>\s*){3,}/g, '<br/><br/>')
  return s.trim()
}

module.exports = {
  LIST_URL, DETAIL_URL,
  fetchEventList, fetchAllEvents, fetchEventBodyHtml, sanitize,
  _internal: { findEventContent, sanitize },
}

// Fetch a pubg.com news article (SSR HTML) and extract the main body.
// Returns sanitized HTML safe to render inside our post body.

async function fetchPubgArticle(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PUBGOP-Sync/1.0',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6',
    },
  })
  if (!res.ok) throw new Error(`pubg.com HTTP ${res.status} for ${url}`)
  const html = await res.text()
  const block = extractDivById(html, 'contentElement')
  if (!block) throw new Error(`contentElement not found in ${url}`)
  return { title: extractArticleTitle(html), body: sanitize(block) }
}

// pubg.com news pages set <title> to "<제목> - 뉴스 - PUBG: 배틀그라운드".
// Strip the trailing site suffix so the post title stays clean.
function extractArticleTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i)
  if (!m) return null
  return m[1]
    .replace(/\s*-\s*뉴스\s*-\s*PUBG:\s*배틀그라운드\s*$/i, '')
    .replace(/\s*-\s*NEWS\s*-\s*PUBG:\s*BATTLEGROUNDS\s*$/i, '')
    .trim()
}

function extractDivById(src, id) {
  const startMarker = new RegExp(`<div[^>]*\\sid=["']${id}["'][^>]*>`, 'i')
  const m = src.match(startMarker)
  if (!m) return null
  const startInner = m.index + m[0].length
  let depth = 1
  const tagRe = /<\/?div\b[^>]*>/gi
  tagRe.lastIndex = startInner
  let tm
  while ((tm = tagRe.exec(src))) {
    if (tm[0].startsWith('</')) {
      depth--
      if (depth === 0) return src.slice(startInner, tm.index)
    } else {
      depth++
    }
  }
  return null
}

// Tags to drop entirely (with their content). pubg.com SSR can include script
// blocks for analytics inside the content, which we don't want.
const DROP_TAGS = ['script', 'style', 'noscript', 'iframe']

// Allow-list of attributes per tag. Anything not listed is stripped.
const ATTR_ALLOW = {
  a: ['href'],
  img: ['src', 'alt'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  col: ['span'],
  colgroup: ['span'],
}

function sanitize(html) {
  let s = html

  // Drop forbidden tags + their inner content.
  for (const tag of DROP_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    s = s.replace(re, '')
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }

  // Strip HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  // Process every tag: keep only allow-listed attributes; force a[target=_blank rel=noopener].
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tagRaw, attrsRaw) => {
    const tag = tagRaw.toLowerCase()
    const isClose = full.startsWith('</')
    if (isClose) return `</${tag}>`

    const selfClose = /\/\s*$/.test(attrsRaw)
    const allow = ATTR_ALLOW[tag] || []
    const kept = []

    if (allow.length) {
      const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g
      let am
      while ((am = attrRe.exec(attrsRaw))) {
        const name = am[1].toLowerCase()
        if (!allow.includes(name)) continue
        let val = am[2]
        if (val[0] === '"' || val[0] === "'") val = val.slice(1, -1)
        // Block javascript: / data: schemes on href/src
        if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(val)) continue
        kept.push(`${name}="${val.replace(/"/g, '&quot;')}"`)
      }
    }

    if (tag === 'a') kept.push('target="_blank"', 'rel="noopener noreferrer"')

    const inside = kept.length ? ' ' + kept.join(' ') : ''
    return `<${tag}${inside}${selfClose ? ' /' : ''}>`
  })

  // Collapse runs of empty paragraphs/spans the sanitizer leaves behind.
  s = s.replace(/<p>\s*<\/p>/g, '')
  s = s.replace(/<span>([\s\S]*?)<\/span>/g, '$1')
  s = s.replace(/(<br\s*\/?>\s*){3,}/g, '<br/><br/>')

  return s.trim()
}

module.exports = { fetchPubgArticle, _internal: { extractDivById, sanitize } }

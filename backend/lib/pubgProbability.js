// Fetch + sanitize the PUBG official "확률형 아이템 정보 공개" page.
// Wraps each H2 section into a card and tags table rows with grade classes
// (matching CSS in src/styles.css under .loot-doc).

const PROBABILITY_URL = 'https://pubg.com/ko/game-info/probability'

// Korean grade names → CSS class suffix.
const GRADE_CLASS = {
  '레전더리': 'legendary',
  '에픽': 'epic',
  '엘리트': 'elite',
  '레어': 'rare',
  '스페셜': 'special',
  '클래식': 'classic',
}
const GRADE_NAMES = Object.keys(GRADE_CLASS)

const DROP_TAGS = ['script', 'style', 'noscript', 'iframe', 'link', 'meta']

// Allow class on structural tags so we can inject grade-* / sum-row markers.
const ATTR_ALLOW = {
  a: ['href'],
  img: ['src', 'alt'],
  td: ['colspan', 'rowspan', 'class'],
  th: ['colspan', 'rowspan', 'class', 'scope'],
  tr: ['class'],
  table: ['class'],
  thead: ['class'],
  tbody: ['class'],
  col: ['span'],
  colgroup: ['span'],
  div: ['class'],
  section: ['class'],
}

async function fetchProbabilityPage() {
  const res = await fetch(PROBABILITY_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PUBGOP-Sync/1.0',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6',
    },
  })
  if (!res.ok) throw new Error(`pubg.com HTTP ${res.status}`)
  return res.text()
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

function sanitize(html) {
  let s = html
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
      const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g
      let am
      while ((am = attrRe.exec(attrsRaw))) {
        const name = am[1].toLowerCase()
        if (!allow.includes(name)) continue
        let val = am[2]
        if (val[0] === '"' || val[0] === "'") val = val.slice(1, -1)
        if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(val)) continue
        if (name === 'class') {
          // Drop pubg.com's own classes; our injector will add ours later.
          continue
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
  return s.trim()
}

// Walk every <tr>, find a cell that holds a grade name, attach class.
function tagGradeRows(html) {
  return html.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g, (full, attrs, inner) => {
    const cells = [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

    let cls = null
    if (cells.some(c => c === '합계' || c === '합 계')) cls = 'sum-row'
    else {
      for (const c of cells) {
        if (GRADE_NAMES.includes(c)) { cls = `grade-${GRADE_CLASS[c]}`; break }
      }
    }
    if (!cls) return full
    const newAttrs = ` class="${cls}"`
    return `<tr${newAttrs}>${inner}</tr>`
  })
}

// Wrap each <h2> ... up-to-next-<h2> block in <section class="crate-section">.
function wrapSections(html) {
  // Insert closing </section> before each subsequent <h2>, then add a leading
  // <section> opener and a trailing </section>.
  const splits = html.split(/(?=<h2\b)/)
  if (splits.length <= 1) return html
  const wrapped = splits
    .map(chunk => `<section class="crate-section">${chunk}</section>`)
    .join('\n')
  return wrapped
}

async function fetchProbabilityHtml() {
  const raw = await fetchProbabilityPage()
  const inner = extractDivById(raw, 'contentElement')
  if (!inner) throw new Error('contentElement not found on probability page')
  let cleaned = sanitize(inner)
  cleaned = tagGradeRows(cleaned)
  cleaned = wrapSections(cleaned)
  return `<div class="loot-doc">\n${cleaned}\n</div>`
}

// Pull the full sanitized page apart at every <h2>. Returns one entry per
// crate, ready to be saved as an individual board post.
//
//   [{ key: 'aespa 전리품', title: 'aespa 전리품', html: '<div class="loot-doc">...</div>' }, ...]
//
// The HTML for each crate keeps the .loot-doc + .crate-section wrapping so the
// existing CSS (grade colors, table layout) applies unchanged.
async function fetchProbabilityCrates() {
  const raw = await fetchProbabilityPage()
  const inner = extractDivById(raw, 'contentElement')
  if (!inner) throw new Error('contentElement not found on probability page')
  let cleaned = sanitize(inner)
  cleaned = tagGradeRows(cleaned)

  // Split right before each <h2>. The first chunk is the page intro (no h2)
  // — drop it so we only emit real crate posts.
  const chunks = cleaned.split(/(?=<h2\b)/)

  const crates = []
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
    if (!titleMatch) continue   // intro / leading text without an h2
    const title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    if (!title) continue
    const html = `<div class="loot-doc"><section class="crate-section">${chunk}</section></div>`
    crates.push({ key: title, title, html })
  }
  return crates
}

module.exports = {
  PROBABILITY_URL,
  GRADE_CLASS,
  fetchProbabilityHtml,
  fetchProbabilityCrates,
  _internal: { extractDivById, sanitize, tagGradeRows, wrapSections },
}

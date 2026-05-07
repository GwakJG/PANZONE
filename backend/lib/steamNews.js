const PUBG_APPID = 578080

async function fetchSteamNews({ appid = PUBG_APPID, count = 200, maxlength = 0 } = {}) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${count}&maxlength=${maxlength}&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'PUBGOP-PatchNoteSync/1.0' } })
  if (!res.ok) throw new Error(`Steam News HTTP ${res.status}`)
  const json = await res.json()
  const items = json?.appnews?.newsitems || []
  return items.map(it => ({
    gid: String(it.gid),
    title: it.title || '',
    url: it.url || '',
    author: it.author || '',
    contents: it.contents || '',
    feedlabel: it.feedlabel || '',
    feedname: it.feedname || '',
    date: new Date((it.date || 0) * 1000),
    tags: Array.isArray(it.tags) ? it.tags : [],
  }))
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function expandSteamImageVars(u) {
  return String(u || '')
    .replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images')
    .replace(/\{STEAM_CLAN_LOC_IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images')
    .trim()
}

function safeUrl(u) {
  const expanded = expandSteamImageVars(u)
  if (!/^https?:\/\//i.test(expanded)) return null
  return expanded.replace(/[\s"'<>`]/g, '')
}

const TOK_OPEN = '@@HTMLSLOT_'
const TOK_CLOSE = '_HTMLSLOT@@'
const TOK_RE = /@@HTMLSLOT_(\d+)_HTMLSLOT@@/g

function bbcodeToHtml(src) {
  if (!src) return ''
  let s = String(src)

  const slots = []
  const stash = html => {
    const tok = TOK_OPEN + slots.length + TOK_CLOSE
    slots.push(html)
    return tok
  }

  s = s.replace(/\[previewyoutube=([^;\];]+)(?:;[^\]]*)?\]\s*\[\/previewyoutube\]/gi, (_, id) => {
    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeId) return ''
    return stash(`<p><a href="https://www.youtube.com/watch?v=${safeId}" target="_blank" rel="noopener">YouTube: ${safeId}</a></p>`)
  })

  s = s.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, raw) => {
    const u = safeUrl(raw)
    return u ? stash(`<img src="${u}" alt="" />`) : ''
  })
  s = s.replace(/\[img\s+src\s*=\s*["']?([^"'\]]+)["']?\s*\](?:\s*\[\/img\])?/gi, (_, raw) => {
    const u = safeUrl(raw)
    return u ? stash(`<img src="${u}" alt="" />`) : ''
  })

  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, text) => {
    const u = safeUrl(href)
    if (!u) return escapeHtml(text)
    return stash(`<a href="${u}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`)
  })
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => {
    const u = safeUrl(href)
    return u ? stash(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`) : ''
  })

  for (const h of ['h1', 'h2', 'h3']) {
    const re = new RegExp(`\\[${h}\\]([\\s\\S]*?)\\[/${h}\\]`, 'gi')
    s = s.replace(re, (_, inner) => stash(`<${h}>${bbcodeInline(inner, stash)}</${h}>`))
  }

  s = s.replace(/\[quote(?:=[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi,
    (_, inner) => stash(`<blockquote>${bbcodeInline(inner, stash)}</blockquote>`))

  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi,
    (_, inner) => stash(`<pre><code>${escapeHtml(inner)}</code></pre>`))

  s = s.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).map(t => t.trim()).filter(Boolean)
    return stash('<ul>' + items.map(t => `<li>${bbcodeInline(t, stash)}</li>`).join('') + '</ul>')
  })
  s = s.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).map(t => t.trim()).filter(Boolean)
    return stash('<ol>' + items.map(t => `<li>${bbcodeInline(t, stash)}</li>`).join('') + '</ol>')
  })

  s = s.replace(/\[table[^\]]*\]([\s\S]*?)\[\/table\]/gi,
    (_, inner) => stash(`<table>${bbcodeInline(inner, stash)}</table>`))
  s = s.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi, (_, inner) => stash(`<tr>${bbcodeInline(inner, stash)}</tr>`))
  s = s.replace(/\[th\]([\s\S]*?)\[\/th\]/gi, (_, inner) => stash(`<th>${bbcodeInline(inner, stash)}</th>`))
  s = s.replace(/\[td\]([\s\S]*?)\[\/td\]/gi, (_, inner) => stash(`<td>${bbcodeInline(inner, stash)}</td>`))

  s = s.replace(/\[hr\]\[\/hr\]|\[hr\s*\/?\]/gi, () => stash('<hr/>'))

  s = bbcodeInline(s, stash)

  s = s.replace(/\[\/?[a-zA-Z][a-zA-Z0-9_=;:./\- "']*\]/g, '')

  s = escapeHtml(s)

  for (let pass = 0; pass < 6; pass++) {
    const before = s
    s = s.replace(TOK_RE, (_, i) => slots[Number(i)] || '')
    if (s === before) break
  }

  const blocks = s.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  const wrapped = blocks.map(b => {
    if (/^\s*<(h[1-6]|ul|ol|table|tr|th|td|blockquote|hr|p|div|img|pre|figure|iframe)/i.test(b)) {
      return b.replace(/\n/g, '<br/>')
    }
    return `<p>${b.replace(/\n/g, '<br/>')}</p>`
  })
  return wrapped.join('\n')
}

function bbcodeInline(input, stash) {
  let buf = String(input)
  buf = buf.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_, t) => stash(`<strong>${escapeHtml(t)}</strong>`))
  buf = buf.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, (_, t) => stash(`<em>${escapeHtml(t)}</em>`))
  buf = buf.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, (_, t) => stash(`<u>${escapeHtml(t)}</u>`))
  buf = buf.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, (_, t) => stash(`<s>${escapeHtml(t)}</s>`))
  return buf
}

function isPatchNote(item) {
  const t = (item.title || '').trim().toLowerCase()
  return /^patch\s*notes\b/.test(t) || /패치\s*노트/.test(item.title || '')
}

module.exports = {
  PUBG_APPID,
  fetchSteamNews,
  bbcodeToHtml,
  isPatchNote,
}

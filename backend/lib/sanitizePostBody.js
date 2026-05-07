// HTML sanitizer for user-authored post / notice bodies.
//
// Permissive whitelist: allow every tag/attribute the WriteToolbar /
// FontToolbar can produce (and what existing posts contain), while
// stripping <script>, on*=, and dangerous URL schemes (javascript:,
// vbscript:, data: in href). Goal is preserving 127 existing posts
// intact while blocking stored-XSS vectors.
//
// Also drops poll-data attributes through unchanged so PostDetail's
// poll renderer keeps working.

const sanitizeHtml = require('sanitize-html')

const options = {
  allowedTags: [
    'p', 'div', 'span', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small', 'mark', 'font',
    'a', 'img', 'video', 'source', 'audio',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'col', 'colgroup', 'caption',
    'figure', 'figcaption',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g',
  ],
  allowedAttributes: {
    '*': ['class', 'style', 'id', 'data-*', 'contenteditable', 'aria-hidden', 'role', 'title', 'lang', 'dir'],
    a: ['href', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
    video: ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload', 'width', 'height'],
    source: ['src', 'type', 'srcset', 'media'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted', 'preload'],
    table: ['border', 'cellpadding', 'cellspacing', 'summary'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'headers', 'scope', 'width'],
    th: ['colspan', 'rowspan', 'align', 'valign', 'scope', 'abbr', 'width'],
    col: ['span', 'width'],
    colgroup: ['span', 'width'],
    font: ['color', 'face', 'size'],
    ol: ['start', 'reversed', 'type'],
    li: ['value'],
    svg: ['width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'xmlns'],
    path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
    polyline: ['points', 'fill', 'stroke', 'stroke-width'],
    polygon: ['points', 'fill', 'stroke', 'stroke-width'],
    g: ['fill', 'stroke', 'transform'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    // Images/videos must use real URLs (uploaded to /uploads/... or external
    // http(s)). blob: URLs are session-local and don't survive a reload, so
    // we don't accept them at save time.
    img: ['http', 'https', 'data'],
    video: ['http', 'https'],
    source: ['http', 'https'],
    audio: ['http', 'https'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'action', 'longdesc'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      'color': [/^.*$/],
      'background-color': [/^.*$/],
      'background': [/^.*$/],
      'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%|pt)$/],
      'font-family': [/^.*$/],
      'font-weight': [/^(?:normal|bold|bolder|lighter|\d{3})$/],
      'font-style': [/^(?:normal|italic|oblique)$/],
      'text-align': [/^(?:left|right|center|justify|start|end)$/],
      'text-decoration': [/^.*$/],
      'text-decoration-line': [/^.*$/],
      'text-indent': [/^.*$/],
      'line-height': [/^.*$/],
      'letter-spacing': [/^.*$/],
      'max-width': [/^.*$/],
      'min-width': [/^.*$/],
      'width': [/^.*$/],
      'max-height': [/^.*$/],
      'min-height': [/^.*$/],
      'height': [/^.*$/],
      'border': [/^.*$/],
      'border-radius': [/^.*$/],
      'border-color': [/^.*$/],
      'border-style': [/^.*$/],
      'border-width': [/^.*$/],
      'padding': [/^.*$/],
      'padding-left': [/^.*$/],
      'padding-right': [/^.*$/],
      'padding-top': [/^.*$/],
      'padding-bottom': [/^.*$/],
      'margin': [/^.*$/],
      'margin-left': [/^.*$/],
      'margin-right': [/^.*$/],
      'margin-top': [/^.*$/],
      'margin-bottom': [/^.*$/],
      'display': [/^(?:block|inline|inline-block|flex|inline-flex|none|table|table-cell|table-row)$/],
      'float': [/^(?:left|right|none)$/],
      'vertical-align': [/^.*$/],
      'opacity': [/^[\d.]+$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const safe = { ...attribs }
      if (safe.href && /^\s*(javascript|vbscript|data|file):/i.test(safe.href)) {
        delete safe.href
      }
      // Force safe target/rel on outbound http(s) links.
      if (safe.href && /^https?:\/\//i.test(safe.href)) {
        safe.target = '_blank'
        safe.rel = 'noopener noreferrer'
      }
      return { tagName: 'a', attribs: safe }
    },
  },
  // Drop these entirely (with their contents).
  nonTextTags: ['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button', 'select'],
}

function sanitizePostBody(html) {
  if (typeof html !== 'string' || !html) return ''
  return sanitizeHtml(html, options)
}

module.exports = { sanitizePostBody }

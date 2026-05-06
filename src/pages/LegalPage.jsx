import { useLanguage } from '../context/LanguageContext'

// Renders a structured legal document from the locale. Expected shape under
// `docKey`: { title, effective, sections: [{ heading, body }, ...] }.
// `body` splits on \n\n into paragraphs; bullet lines starting with "- " render
// as a <ul>. Admin/business-specific placeholders use {{label}} in the text
// — kept as-is so the operator can spot and fill them before going live.
export default function LegalPage({ docKey }) {
  const { t } = useLanguage()
  const doc = t(docKey)
  // If the key didn't resolve (missing translation), `t` returns the key
  // string — bail out with a placeholder rather than crashing the page.
  if (typeof doc !== 'object' || !doc) {
    return <main className="legal-page"><article className="legal-content"><p>Not available.</p></article></main>
  }

  return (
    <main className="legal-page">
      <article className="legal-content">
        <h1 className="legal-title">{doc.title}</h1>
        {doc.effective && <p className="legal-effective">{doc.effective}</p>}
        {doc.preamble && (
          <div className="legal-preamble">
            {doc.preamble.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}
        {(doc.sections || []).map((sec, i) => (
          <section key={i} className="legal-section">
            <h2 className="legal-heading">{sec.heading}</h2>
            {renderBody(sec.body)}
          </section>
        ))}
      </article>
    </main>
  )
}

function renderBody(text) {
  if (!text) return null
  // Split into blocks on blank lines. A block is either a prose paragraph or
  // a bullet list (all lines start with "- ").
  const blocks = text.split('\n\n')
  return blocks.map((block, i) => {
    const lines = block.split('\n')
    if (lines.every(l => l.startsWith('- '))) {
      return (
        <ul key={i} className="legal-list">
          {lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
        </ul>
      )
    }
    return <p key={i}>{block}</p>
  })
}

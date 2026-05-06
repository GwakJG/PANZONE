const PAGES_PER_BATCH = 10

export default function BoardPagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 0) return null

  const batchIndex = Math.floor((currentPage - 1) / PAGES_PER_BATCH)
  const batchStart = batchIndex * PAGES_PER_BATCH + 1
  const batchEnd = Math.min(batchStart + PAGES_PER_BATCH - 1, totalPages)

  const pages = []
  for (let i = batchStart; i <= batchEnd; i++) pages.push(i)

  const hasPrev = batchStart > 1
  const hasNext = batchEnd < totalPages
  const atFirst = currentPage <= 1
  const atLast = currentPage >= totalPages

  function goFirst() {
    onChange(1)
  }
  function goLast() {
    onChange(totalPages)
  }
  function goPrevBatch() {
    onChange(Math.max(batchStart - PAGES_PER_BATCH, 1))
  }
  function goNextBatch() {
    onChange(batchEnd + 1)
  }

  return (
    <nav className="board-pagination" aria-label="pagination">
      <button
        type="button"
        className="board-page-btn board-page-nav"
        onClick={goFirst}
        disabled={atFirst}
        aria-label="first"
      >
        &laquo;
      </button>
      <button
        type="button"
        className="board-page-btn board-page-nav"
        onClick={goPrevBatch}
        disabled={!hasPrev}
        aria-label="previous"
      >
        &lt;
      </button>
      {pages.map(p => (
        <button
          key={p}
          type="button"
          className={`board-page-btn ${p === currentPage ? 'active' : ''}`}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        className="board-page-btn board-page-nav"
        onClick={goNextBatch}
        disabled={!hasNext}
        aria-label="next"
      >
        &gt;
      </button>
      <button
        type="button"
        className="board-page-btn board-page-nav"
        onClick={goLast}
        disabled={atLast}
        aria-label="last"
      >
        &raquo;
      </button>
    </nav>
  )
}

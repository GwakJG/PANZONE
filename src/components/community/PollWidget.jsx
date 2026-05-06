import { useEffect, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth, useRequireLogin } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useApiError, isAuthError, isSuspendedError } from '../../hooks/useApiError'
import { fetchPoll, togglePollVote } from '../../services/pollApi'

export default function PollWidget({ postId, question, options }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const formatError = useApiError()
  const showToast = useToast()
  const [counts, setCounts] = useState({})
  const [myVote, setMyVote] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPoll(postId)
      .then(s => {
        if (cancelled) return
        setCounts(s.counts || {})
        setMyVote(s.myVote ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [postId])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const hasVoted = myVote !== null && myVote !== undefined

  async function handleClick(idx) {
    if (!user) { requireLogin(); return }
    if (submitting) return
    setSubmitting(true)
    try {
      const next = await togglePollVote(postId, idx)
      setCounts(next.counts || {})
      setMyVote(next.myVote ?? null)
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="post-poll-q">
        <svg className="post-poll-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="19" x2="5" y2="13" />
          <line x1="12" y1="19" x2="12" y2="5" />
          <line x1="19" y1="19" x2="19" y2="10" />
        </svg>
        {question}
      </div>
      <ul className="post-poll-opts">
        {options.map((o, i) => {
          const c = counts[i] || 0
          const pct = total ? Math.round((c / total) * 100) : 0
          const selected = myVote === i
          return (
            <li key={i}>
              <button
                type="button"
                className={`post-poll-opt ${selected ? 'selected' : ''} ${hasVoted ? 'voted' : ''}`}
                onClick={() => handleClick(i)}
                disabled={submitting}
              >
                {hasVoted && <span className="post-poll-bar" style={{ width: `${pct}%` }} />}
                <span className="post-poll-label">{o}</span>
                {hasVoted && (
                  <span className="post-poll-stats">{c} · {pct}%</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {hasVoted && (
        <div className="post-poll-total">{t('community.poll.totalVotes').replace('{n}', String(total))}</div>
      )}
    </>
  )
}

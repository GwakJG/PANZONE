import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Global modal triggered when a write request returns 403 "Account suspended".
// Confirm button sends the user to their profile where the appeal UI lives.
export default function SuspendedRequiredModal() {
  const { user, suspendedPromptOpen, closeSuspendedPrompt } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!suspendedPromptOpen) return
    function onKey(e) { if (e.key === 'Escape') closeSuspendedPrompt() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [suspendedPromptOpen, closeSuspendedPrompt])

  if (!suspendedPromptOpen) return null

  function goToProfile() {
    closeSuspendedPrompt()
    if (user) navigate(`/user/${encodeURIComponent(user.name)}`)
  }

  return (
    <div className="modal-backdrop" onClick={closeSuspendedPrompt}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">계정이 정지되었습니다</h2>
        <p className="modal-body">
          글 작성 · 댓글 · 추천 등 활동이 제한되었습니다.
          프로필 페이지에서 상세 사유와 문의하기를 확인해주세요.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={closeSuspendedPrompt}>
            닫기
          </button>
          <button type="button" className="modal-btn-primary" onClick={goToProfile}>
            프로필로 이동
          </button>
        </div>
      </div>
    </div>
  )
}

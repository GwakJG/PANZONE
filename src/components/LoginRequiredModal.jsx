import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

export default function LoginRequiredModal() {
  const { t } = useLanguage()
  const { loginPromptOpen, closeLoginPrompt } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loginPromptOpen) return
    function onKey(e) { if (e.key === 'Escape') closeLoginPrompt() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loginPromptOpen, closeLoginPrompt])

  if (!loginPromptOpen) return null

  function goToLogin() {
    closeLoginPrompt()
    navigate('/login')
  }

  return (
    <div className="modal-backdrop" onClick={closeLoginPrompt}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{t('common.loginRequiredTitle')}</h2>
        <p className="modal-body">{t('common.loginRequiredMessage')}</p>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={closeLoginPrompt}>
            {t('community.action.cancel')}
          </button>
          <button type="button" className="modal-btn-primary" onClick={goToLogin}>
            {t('common.goToLogin')}
          </button>
        </div>
      </div>
    </div>
  )
}

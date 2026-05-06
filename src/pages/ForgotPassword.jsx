import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import { useApiError } from '../hooks/useApiError'
import * as authApi from '../services/authApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const { t } = useLanguage()
  const showToast = useToast()
  const formatError = useApiError()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  const emailValid = EMAIL_RE.test(email)
  const emailInvalid = email.length > 0 && !emailValid

  async function handleSubmit(e) {
    e.preventDefault()
    if (!emailValid || sending) return
    setSending(true)
    try {
      const resp = await authApi.forgotPassword(email)
      const msg = resp.devTempPassword
        ? `${t('forgot.sent')} (dev: ${resp.devTempPassword})`
        : t('forgot.sent')
      showToast(msg, 'success')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      showToast(formatError(err), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{t('forgot.title')}</h1>

        <label className="auth-field">
          <span className="auth-label">{t('forgot.email')}</span>
          <input
            type="email"
            className={`auth-input ${emailInvalid ? 'auth-input-error' : ''}`}
            placeholder={t('forgot.emailPlaceholder')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          {emailInvalid && (
            <span className="auth-error">{t('forgot.emailInvalid')}</span>
          )}
        </label>

        <button type="submit" className="auth-submit" disabled={!emailValid || sending}>
          {sending ? t('forgot.sending') : t('forgot.submit')}
        </button>

        <div className="auth-links">
          <Link to="/login" className="auth-link">{t('forgot.backToLogin')}</Link>
        </div>
      </form>
    </main>
  )
}

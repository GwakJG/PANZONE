import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApiError } from '../hooks/useApiError'
import PasswordInput from '../components/PasswordInput'

export default function Login() {
  const { t } = useLanguage()
  const { login } = useAuth()
  const showToast = useToast()
  const formatError = useApiError()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    if (!email || !password) return
    setSubmitting(true)
    try {
      await login({ email, password, rememberMe })
      showToast(t('login.success'), 'success')
      // Prefer the page that sent the user here (when LoginRequiredModal
      // routed them via /login from a deep link). Fall back to home —
      // navigate(-1) would walk out of the SPA when /login was the entry.
      const from = location.state?.from
      if (from) navigate(from, { replace: true })
      else navigate('/', { replace: true })
    } catch (err) {
      showToast(formatError(err) || t('login.failed'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{t('login.title')}</h1>

        <label className="auth-field">
          <span className="auth-label">{t('login.id')}</span>
          <input
            type="email"
            className="auth-input"
            placeholder={t('login.idPlaceholder')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="auth-field">
          <span className="auth-label">{t('login.password')}</span>
          <PasswordInput
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <label className="auth-remember">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
          />
          <span>{t('login.rememberMe')}</span>
        </label>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.login')}
        </button>

        <div className="auth-links">
          <Link to="/signup" className="auth-link">{t('login.signup')}</Link>
          <span className="auth-link-sep">·</span>
          <Link to="/forgot-password" className="auth-link">{t('login.forgot')}</Link>
        </div>
      </form>
    </main>
  )
}

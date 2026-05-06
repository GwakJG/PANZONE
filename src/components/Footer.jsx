import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth, useRequireLogin } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApiError, isAuthError, isSuspendedError } from '../hooks/useApiError'
import InquiryModal from './InquiryModal'
import { submitInquiry } from '../services/inquiryApi'

export default function Footer() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const showToast = useToast()
  const formatError = useApiError()
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const year = new Date().getFullYear()

  function openInquiry() {
    if (!user) { requireLogin(); return }
    setInquiryOpen(true)
  }

  async function handleInquirySubmit({ message, imageUrls }) {
    try {
      await submitInquiry({ kind: 'general', message, imageUrls })
      setInquiryOpen(false)
      showToast(t('inquiry.done'), 'success')
    } catch (err) {
      if (!isAuthError(err) && !isSuspendedError(err)) showToast(formatError(err), 'error')
    }
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-name">PanZone</span>
          <span className="site-footer-tagline">{t('footer.tagline')}</span>
        </div>
        <nav className="site-footer-links">
          <Link to="/terms">{t('footer.terms')}</Link>
          <span className="site-footer-sep">·</span>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <span className="site-footer-sep">·</span>
          <button type="button" className="site-footer-link-btn" onClick={openInquiry}>
            {t('footer.contact')}
          </button>
        </nav>
        <div className="site-footer-copy">© {year} PanZone</div>
        <div className="site-footer-disclaimer">{t('footer.disclaimer')}</div>
      </div>

      <InquiryModal
        open={inquiryOpen}
        title={t('inquiry.title')}
        subtitle={t('inquiry.subtitle')}
        onConfirm={handleInquirySubmit}
        onCancel={() => setInquiryOpen(false)}
      />
    </footer>
  )
}

import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// Drop-in replacement for `<input type="password" />`. All standard input
// props (value, onChange, className, autoComplete, disabled, …) pass through
// via `...rest`. Toggle button lives in a right-aligned absolute slot that
// overlaps the input's right padding.
export default function PasswordInput({ className = 'auth-input', ...rest }) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-input-wrap">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={`${className} password-input-field`}
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? t('passwordInput.hide') : t('passwordInput.show')}
        tabIndex={-1}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  )
}

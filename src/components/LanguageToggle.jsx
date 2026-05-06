import { useLanguage } from '../context/LanguageContext'

export default function LanguageToggle() {
  const { lang, toggleLanguage } = useLanguage()

  return (
    <button className="lang-toggle" onClick={toggleLanguage} title="Toggle language">
      {lang === 'en' ? 'KR' : 'EN'}
    </button>
  )
}

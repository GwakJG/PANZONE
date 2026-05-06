import { createContext, useContext, useState, useEffect } from 'react'
import en from '../locales/en.json'
import ko from '../locales/ko.json'

const LanguageContext = createContext()

const LANG_KEY = 'pubgop_language'
const translations = { en, ko }

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem(LANG_KEY) || 'ko'
  })

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  function toggleLanguage() {
    setLang(prev => (prev === 'en' ? 'ko' : 'en'))
  }

  function t(path, ...args) {
    const keys = path.split('.')
    let value = translations[lang]
    for (const key of keys) {
      value = value?.[key]
    }
    if (!value) return path
    return args.reduce((str, arg, i) => str.replace(`{${i}}`, arg), value)
  }

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from './ToastContext'
import { useLanguage } from './LanguageContext'
import * as authApi from '../services/authApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)
  const [suspendedPromptOpen, setSuspendedPromptOpen] = useState(false)
  const showToast = useToast()
  const { t } = useLanguage()
  const navigate = useNavigate()

  useEffect(() => {
    authApi.setUnauthorizedHandler(() => {
      setUser(null)
      showToast(t('common.loginRequired'))
    })
    return () => authApi.setUnauthorizedHandler(null)
  }, [showToast, t])

  useEffect(() => {
    authApi.setSuspendedHandler(() => setSuspendedPromptOpen(true))
    return () => authApi.setSuspendedHandler(null)
  }, [])

  useEffect(() => {
    const token = authApi.getToken()
    if (!token) { setReady(true); return }
    authApi.fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => authApi.setToken(null))
      .finally(() => setReady(true))
  }, [])

  async function login({ email, password, rememberMe = false }) {
    const { token, user } = await authApi.login({ email, password, rememberMe })
    authApi.setToken(token, { persistent: !!rememberMe })
    setUser(user)
    return user
  }

  async function signup({ email, code, password, name }) {
    const { token, user } = await authApi.signup({ email, code, password, name })
    // 회원가입 직후는 곧바로 자동 로그인 (브라우저 닫아도 유지) — 백엔드도 30d 토큰 발급.
    authApi.setToken(token, { persistent: true })
    setUser(user)
    return user
  }

  function logout() {
    authApi.setToken(null)
    setUser(null)
    navigate('/')
  }

  function updateUser(next) {
    setUser(next)
  }

  const openLoginPrompt = useCallback(() => setLoginPromptOpen(true), [])
  const closeLoginPrompt = useCallback(() => setLoginPromptOpen(false), [])
  const closeSuspendedPrompt = useCallback(() => setSuspendedPromptOpen(false), [])

  return (
    <AuthContext.Provider value={{
      user, ready, login, signup, logout, updateUser,
      loginPromptOpen, openLoginPrompt, closeLoginPrompt,
      suspendedPromptOpen, closeSuspendedPrompt,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useRequireLogin() {
  const { user, openLoginPrompt } = useAuth()

  return function guard(action) {
    if (!user) {
      openLoginPrompt()
      return false
    }
    if (typeof action === 'function') action()
    return true
  }
}

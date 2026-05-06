const BASE = '/api/auth'
const TOKEN_KEY = 'pubgop_token'

// 자동 로그인(persistent) → localStorage. 미체크(session-only) → sessionStorage.
// localStorage 우선 — 기존 사용자(이미 localStorage에 토큰 보유)는 영향 없이 그대로 유지.
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token, { persistent = false } = {}) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    return
  }
  // 한 쪽에만 두기 — 두 곳에 있으면 동기화 이슈가 생길 수 있음.
  if (persistent) {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.setItem(TOKEN_KEY, token)
  }
}

let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

export function handleUnauthorized() {
  setToken(null)
  if (unauthorizedHandler) unauthorizedHandler()
}

// Triggered when any API returns 403 with error='Account suspended'.
// Registered globally (AuthContext) so a single modal can intercept the event.
let suspendedHandler = null
export function setSuspendedHandler(fn) {
  suspendedHandler = fn
}

export function handleSuspended() {
  if (suspendedHandler) suspendedHandler()
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && auth) handleUnauthorized()
    if (res.status === 403 && data.error === 'Account suspended') handleSuspended()
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function sendCode(email) {
  return request('/send-code', { method: 'POST', body: { email } })
}

export function checkNickname(name) {
  return request(`/check-nickname?name=${encodeURIComponent(name)}`)
}

export function forgotPassword(email) {
  return request('/forgot-password', { method: 'POST', body: { email } })
}

export function signup({ email, code, password, name }) {
  return request('/signup', { method: 'POST', body: { email, code, password, name } })
}

export function login({ email, password, rememberMe }) {
  return request('/login', { method: 'POST', body: { email, password, rememberMe: !!rememberMe } })
}

export function fetchMe() {
  return request('/me', { auth: true })
}

export function updateMe({ name, avatarUrl, bio }) {
  const body = {}
  if (name !== undefined) body.name = name
  if (avatarUrl !== undefined) body.avatarUrl = avatarUrl
  if (bio !== undefined) body.bio = bio
  return request('/me', { method: 'PATCH', body, auth: true })
}

export function changePassword({ currentPassword, newPassword }) {
  return request('/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
    auth: true,
  })
}

export function deleteAccount({ password }) {
  return request('/me', {
    method: 'DELETE',
    body: { password },
    auth: true,
  })
}

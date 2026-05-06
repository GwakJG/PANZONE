import { getToken, handleUnauthorized, handleSuspended } from './authApi'

const BASE = '/api/reports'

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

export function submitReport({ targetType, targetId, reason, reasonCodes, imageUrls }) {
  return request('/', {
    method: 'POST',
    body: { targetType, targetId, reason, reasonCodes, imageUrls },
    auth: true,
  })
}

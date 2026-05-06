import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/inquiries'

async function request(path, { method = 'POST', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function submitInquiry({ kind, message, imageUrls } = {}) {
  return request('/', { method: 'POST', body: { kind, message, imageUrls } })
}

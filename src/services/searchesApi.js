import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/searches'

async function request(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
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

export function fetchSearches() {
  return request('/')
}

export function addSearch(term) {
  return request('/', { method: 'POST', body: { term } })
}

export function removeSearch(term) {
  return request(`/?term=${encodeURIComponent(term)}`, { method: 'DELETE' })
}

export function clearSearches() {
  return request('/', { method: 'DELETE' })
}

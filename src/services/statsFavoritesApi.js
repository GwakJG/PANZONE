import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/stats-favorites'

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

export function fetchFavorites() {
  return request('/')
}

export function addFavorite(player, platform) {
  return request('/', { method: 'POST', body: { player, platform } })
}

export function removeFavorite(player, platform) {
  const qs = `player=${encodeURIComponent(player)}&platform=${encodeURIComponent(platform)}`
  return request(`/?${qs}`, { method: 'DELETE' })
}

export function clearFavorites() {
  return request('/', { method: 'DELETE' })
}

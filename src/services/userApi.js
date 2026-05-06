import { getToken } from './authApi'

const BASE = '/api/users'

// Always attach bearer token when available so the server can identify admins
// and bypass suspension filters. Public users just don't send a token.
async function request(path) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers, cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export function fetchUser(name) {
  return request(`/${encodeURIComponent(name)}`)
}

export function fetchUserPosts(name, { page = 1, pageSize = 20, sort, order } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  return request(`/${encodeURIComponent(name)}/posts?${params.toString()}`)
}

import { getToken, handleUnauthorized, handleSuspended } from './authApi'

const BASE = '/api/posts'

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // Always attach the token when the user is logged in — optionalAuth endpoints
  // use it to detect admins and bypass suspension filters. Only `auth: true`
  // endpoints trigger the 401 unauthorized handler.
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
    if (res.status === 401 && auth) handleUnauthorized()
    if (res.status === 403 && data.error === 'Account suspended') handleSuspended()
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function fetchPosts({ board, page = 1, pageSize = 20, q, field, all, subcategory } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (board) params.set('board', board)
  if (q) params.set('q', q)
  if (field) params.set('field', field)
  if (all) params.set('all', '1')
  if (subcategory) params.set('subcategory', subcategory)
  return request(`/?${params.toString()}`)
}

export function fetchPost(id) {
  return request(`/${id}`, { auth: true })
}

export function fetchHotPosts({ period = '1d' } = {}) {
  return request(`/hot?period=${encodeURIComponent(period)}`)
}

export function fetchFeaturedPosts() {
  return request('/featured')
}

export function createPost({ boardSlug, title, body, isPinned, subcategory }) {
  const payload = { boardSlug, title, body }
  if (isPinned !== undefined) payload.isPinned = isPinned
  if (subcategory !== undefined) payload.subcategory = subcategory
  return request('/', { method: 'POST', body: payload, auth: true })
}

export function updatePost(id, { title, body, isPinned, subcategory }) {
  const payload = {}
  if (title !== undefined) payload.title = title
  if (body !== undefined) payload.body = body
  if (isPinned !== undefined) payload.isPinned = isPinned
  if (subcategory !== undefined) payload.subcategory = subcategory
  return request(`/${id}`, { method: 'PATCH', body: payload, auth: true })
}

export function deletePost(id, { reason } = {}) {
  return request(`/${id}`, {
    method: 'DELETE',
    body: reason ? { reason } : undefined,
    auth: true,
  })
}

export function toggleReaction(id, type) {
  return request(`/${id}/reaction`, { method: 'POST', body: { type }, auth: true })
}

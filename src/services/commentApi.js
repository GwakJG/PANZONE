import { getToken, handleUnauthorized, handleSuspended } from './authApi'

const BASE = '/api/comments'

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // Always attach token when logged in — optionalAuth endpoints use it to
  // detect admin viewers. 401 handling only applies to `auth: true` calls.
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

export function fetchComments(postId) {
  return request(`/?postId=${encodeURIComponent(postId)}`)
}

export function createComment({ postId, body, imageUrl, parentId } = {}) {
  return request('/', {
    method: 'POST',
    body: { postId, body, imageUrl, parentId },
    auth: true,
  })
}

export function updateComment(id, { body }) {
  return request(`/${id}`, { method: 'PATCH', body: { body }, auth: true })
}

export function deleteComment(id) {
  return request(`/${id}`, { method: 'DELETE', auth: true })
}

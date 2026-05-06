import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/polls'

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
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function fetchPoll(postId) {
  return request(`/${postId}`, { auth: true })
}

export function togglePollVote(postId, optionIdx) {
  return request(`/${postId}/vote`, {
    method: 'POST',
    body: { optionIdx },
    auth: true,
  })
}

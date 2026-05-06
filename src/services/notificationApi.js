import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/notifications'

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

export function fetchNotifications({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  return request(`/?${params.toString()}`)
}

export function fetchUnreadCount() {
  return request('/unread-count')
}

export function markRead(id) {
  return request(`/${id}/read`, { method: 'POST' })
}

export function markAllRead() {
  return request('/read-all', { method: 'POST' })
}

export function deleteNotification(id) {
  return request(`/${id}`, { method: 'DELETE' })
}

export function fetchNotificationPage(id, { pageSize = 20 } = {}) {
  return request(`/${id}/page?pageSize=${pageSize}`)
}

export function fetchAllNotificationIds() {
  return request('/ids')
}

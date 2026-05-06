import { getToken, handleUnauthorized } from './authApi'

const BASE = '/api/admin'

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

export function pingAdmin() {
  return request('/ping')
}

export function fetchAdminDashboard() {
  return request('/dashboard')
}

// ===== Notification send (admin → user) =====

export function sendNotification({ userId, title, body, kind, linkUrl }) {
  return request('/notifications', {
    method: 'POST',
    body: { userId, title, body, kind, linkUrl },
  })
}

export function sendNotificationsBulk({ userIds, title, body, kind, linkUrl }) {
  return request('/notifications/bulk', {
    method: 'POST',
    body: { userIds, title, body, kind, linkUrl },
  })
}

export function broadcastNotificationToAll({ title, body, kind, linkUrl, filter }) {
  return request('/notifications/broadcast', {
    method: 'POST',
    body: { title, body, kind, linkUrl, filter },
  })
}

// ===== Notification templates (자주하는 답변) =====

export function fetchNotificationTemplates() {
  return request('/notification-templates')
}

export function createNotificationTemplate({ title, body }) {
  return request('/notification-templates', {
    method: 'POST',
    body: { title, body },
  })
}

export function updateNotificationTemplate(id, { title, body }) {
  return request(`/notification-templates/${id}`, {
    method: 'PUT',
    body: { title, body },
  })
}

export function deleteNotificationTemplate(id) {
  return request(`/notification-templates/${id}`, { method: 'DELETE' })
}

export function fetchAdminUsers({ page = 1, pageSize = 20, tier, sort, order, q } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (tier) params.set('tier', tier)
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  if (q) params.set('q', q)
  return request(`/users?${params.toString()}`)
}

export function suspendUser(id, { reason }) {
  return request(`/users/${id}/suspend`, { method: 'POST', body: { reason } })
}

export function unsuspendUser(id) {
  return request(`/users/${id}/unsuspend`, { method: 'POST' })
}

// ===== Featured (carousel) =====

export function fetchFeaturedSlots() {
  return request('/featured')
}

export function createFeatured(body) {
  return request('/featured', { method: 'POST', body })
}

export function updateFeatured(id, body) {
  return request(`/featured/${id}`, { method: 'PUT', body })
}

export function deleteFeatured(id) {
  return request(`/featured/${id}`, { method: 'DELETE' })
}

export function reorderFeatured(ids) {
  return request('/featured/reorder', { method: 'PATCH', body: { ids } })
}

// ===== Post list for featured tab (any board) + board list =====

export function fetchAdminBoards({ includeData = false } = {}) {
  const qs = includeData ? '?includeData=1' : ''
  return request(`/boards${qs}`)
}

export function fetchAdminNotices({ page = 1, pageSize = 20, board, sort, order, q, status } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (board) params.set('board', board)
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  return request(`/notices?${params.toString()}`)
}

export function fetchAdminAuthoredPosts({ page = 1, pageSize = 20, board, sort, order, q } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (board) params.set('board', board)
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  if (q) params.set('q', q)
  return request(`/admin-posts?${params.toString()}`)
}

export function broadcastNotice({ boardSlugs, title, body, isPinned }) {
  return request('/notices/broadcast', {
    method: 'POST',
    body: { boardSlugs, title, body, isPinned },
  })
}

// ===== Notice drafts (임시저장) =====

export function fetchNoticeDrafts() {
  return request('/notice-drafts')
}

export function fetchNoticeDraft(id) {
  return request(`/notice-drafts/${id}`)
}

export function createNoticeDraft({ title, body, boardSlugs }) {
  return request('/notice-drafts', {
    method: 'POST',
    body: { title, body, boardSlugs },
  })
}

export function updateNoticeDraft(id, { title, body, boardSlugs }) {
  return request(`/notice-drafts/${id}`, {
    method: 'PUT',
    body: { title, body, boardSlugs },
  })
}

export function deleteNoticeDraft(id) {
  return request(`/notice-drafts/${id}`, { method: 'DELETE' })
}

export function toggleNoticeFavorite(id, favorite) {
  return request(`/notices/${id}/favorite`, { method: 'PATCH', body: { favorite } })
}

export function toggleNoticePin(id, pinned) {
  return request(`/notices/${id}/pin`, { method: 'PATCH', body: { pinned } })
}

export function deleteNotice(id) {
  return request(`/notices/${id}`, { method: 'DELETE' })
}

// ===== Reports queue =====

export function fetchAdminReports({ page = 1, pageSize = 20, status, code, sort, order, q } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (status) params.set('status', status)
  if (code) params.set('code', code)
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  if (q) params.set('q', q)
  return request(`/reports?${params.toString()}`)
}

export function resolveReport(id, { action, message }) {
  return request(`/reports/${id}/resolve`, { method: 'PATCH', body: { action, message } })
}

export function reopenReport(id) {
  return request(`/reports/${id}/reopen`, { method: 'PATCH' })
}

export function updateReportMemo(id, memo) {
  return request(`/reports/${id}/memo`, { method: 'PATCH', body: { memo } })
}

// ===== Inquiries queue =====

export function fetchAdminInquiries({ page = 1, pageSize = 20, status, kind, sort, order, q } = {}) {
  const params = new URLSearchParams({ page, pageSize })
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  if (sort) params.set('sort', sort)
  if (order) params.set('order', order)
  if (q) params.set('q', q)
  return request(`/inquiries?${params.toString()}`)
}

export function resolveInquiry(id, { action, message }) {
  return request(`/inquiries/${id}/resolve`, { method: 'PATCH', body: { action, message } })
}

export function reopenInquiry(id) {
  return request(`/inquiries/${id}/reopen`, { method: 'PATCH' })
}

export function updateInquiryMemo(id, memo) {
  return request(`/inquiries/${id}/memo`, { method: 'PATCH', body: { memo } })
}

import { getToken, handleUnauthorized } from './authApi'

export async function uploadImage(file) {
  const form = new FormData()
  form.append('file', file)
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch('/api/uploads/image', {
    method: 'POST',
    headers,
    body: form,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data.url
}

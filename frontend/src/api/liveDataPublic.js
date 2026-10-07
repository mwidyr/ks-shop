import axios from 'axios'
import { API_BASE } from './client'

// Deliberately its OWN axios instance, not the shared api/client.js one - that client attaches
// any staff JWT sitting in localStorage and, critically, clears it + redirects to /login on any
// 401. Neither behavior belongs on this public, no-login page: a wrong access code is an
// expected outcome here, not a reason to log a staff member out of the dashboard in another tab
// of the same browser.
const publicClient = axios.create({ baseURL: API_BASE })

const TOKEN_KEY = 'live_data_session_token'

publicClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function getStoredSessionToken() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function verifyAccessCode(code) {
  return publicClient.post('/public/live-data/verify-code', { code }).then((res) => {
    sessionStorage.setItem(TOKEN_KEY, res.data.token)
    return res.data
  })
}

export function listPublicLocations() {
  return publicClient.get('/public/live-data/locations').then((res) => res.data).catch(() => [])
}

export function listPublicHosts(locationId) {
  const q = locationId ? `?location_id=${locationId}` : ''
  return publicClient.get(`/public/live-data/hosts${q}`).then((res) => res.data).catch(() => [])
}

export function uploadPublicImage(file) {
  const form = new FormData()
  form.append('image', file)
  return publicClient.post('/public/live-data/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((res) => res.data.url)
}

export function recognizeLiveData(imageUrls) {
  return publicClient.post('/public/live-data/recognize', { image_urls: imageUrls }).then((res) => res.data)
}

export function submitLiveData(payload) {
  return publicClient.post('/public/live-data/submit', payload).then((res) => res.data)
}

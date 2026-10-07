import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

// Pages reachable without logging in - a 401 here must never bounce the visitor to /login.
const PUBLIC_PATHS = ['/login', '/live-data-upload', '/pickup/', '/forgot-password', '/reset-password', '/accept-invite']

const client = axios.create({ baseURL: API_BASE })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client

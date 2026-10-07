import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: the storefront runs on :5174 and proxies the Go API (:8080) so the browser stays
// same-origin, exactly like production (nginx proxies /api and /uploads to the backend).
const API = process.env.VITE_DEV_API || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: { '/api': API, '/uploads': API },
  },
})

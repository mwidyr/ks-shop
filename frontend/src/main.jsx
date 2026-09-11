import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './i18n'
import { applyFontScale, getFontScale } from './utils/fontScale'
import { applyDarkMode, getDarkMode } from './utils/darkMode'

applyFontScale(getFontScale())
applyDarkMode(getDarkMode())

// Now that tab access is real (see role_tab_access / RequireTabView/Edit), a 403 from our own
// API is an expected outcome for a role browsing outside its allowed tabs (e.g. via a direct
// URL rather than the nav, which already hides what a role can't see) - not a bug to surface as
// an uncaught console error. The page's own empty/error state already reflects this; primary
// content fetches deliberately don't each need their own .catch() for this specific case.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.response?.status === 403) {
    event.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

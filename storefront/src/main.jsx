import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import App from './App.jsx'
import { CartProvider } from './lib/cart.jsx'
import { StoreProvider } from './lib/store.jsx'
import { MemberProvider } from './lib/member.jsx'
import { getThemePreview } from './lib/api'
import './index.css'

// ?theme_preview=<token>: show an unpublished draft theme (admin test link, time-boxed, noindex).
const token = new URLSearchParams(window.location.search).get('theme_preview')
if (token) {
  getThemePreview(token).then((p) => {
    const style = document.createElement('style')
    style.textContent = p.css
    document.head.appendChild(style)
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
  }).catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <MemberProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </MemberProvider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

import { resetSharedPeriod } from '../utils/sharedPeriod'
import { createContext, useContext, useState } from 'react'
import client from '../api/client'
import { invalidateLookups } from '../api/lookupCache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })

  function applySession(token, sessionUser) {
    invalidateLookups() // reference lists cached for the previous user must not be shown to this one
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(sessionUser))
    setUser(sessionUser)
    return sessionUser
  }

  async function login(email, password) {
    const res = await client.post('/auth/login', { email, password })
    resetSharedPeriod()
    return applySession(res.data.token, res.data.user)
  }

  function logout() {
    resetSharedPeriod()
    invalidateLookups()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, applySession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

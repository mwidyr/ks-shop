import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getMyAccess } from '../api/rolePermissions'
import { useAuth } from './AuthContext'
import { tabForPath } from '../components/navConfig'

// The signed-in user's access per tab ('edit' | 'view'; a missing tab = no access), loaded once per
// login instead of by every page. super_user always has full access.
export const AccessContext = createContext({ loaded: false, isSuperUser: false, access: null, role: '' })

// Pure rule: what level a role has on a tab. While the access map is still loading nothing is
// locked (the server enforces edit rights anyway), so the UI does not flash read-only.
export function tabLevel({ loaded, isSuperUser, access }, tab) {
  if (!loaded || isSuperUser || !tab) return 'edit'
  return access?.[tab] || 'none'
}

export function AccessProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState({ loaded: false, isSuperUser: false, access: null, role: '' })
  useEffect(() => {
    if (!user) { setState({ loaded: false, isSuperUser: false, access: null, role: '' }); return undefined }
    let live = true
    getMyAccess()
      .then((res) => { if (live) setState({ loaded: true, isSuperUser: res.role === 'super_user', access: res.access || {}, role: res.role || '' }) })
      .catch(() => { if (live) setState({ loaded: true, isSuperUser: false, access: {}, role: '' }) })
    return () => { live = false }
  }, [user?.id])
  const value = useMemo(() => state, [state])
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export const useAccess = () => useContext(AccessContext)

// 'edit' | 'view' | 'none' for a tab; with no argument, for the tab of the current page.
export function useTabLevel(tab) {
  const access = useAccess()
  const { pathname } = useLocation()
  return tabLevel(access, tab || tabForPath(pathname))
}

// Can the user change things on this page / tab? False for view-only (and no-access) roles.
export const useCanEdit = (tab) => useTabLevel(tab) === 'edit'

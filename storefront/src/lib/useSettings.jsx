import { createContext, useContext, useEffect, useState } from 'react'
import { getSettings, getCategories, getPromotions } from './api'

const Ctx = createContext({ settings: null, categories: [], promotions: [] })

// Store-wide reference data (shop name, shipping rules, categories, live vouchers) loaded once.
export function StoreProvider({ children }) {
  const [state, setState] = useState({ settings: null, categories: [], promotions: [] })
  useEffect(() => {
    Promise.all([getSettings().catch(() => null), getCategories().catch(() => []), getPromotions().catch(() => [])])
      .then(([settings, categories, promotions]) => setState({ settings, categories, promotions }))
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCategoryTree, getSettings } from './api'

const Ctx = createContext(null)

const DEFAULTS = {
  shop_name: 'ralulu', free_shipping_minimarket: 1500, free_shipping_courier: 1500, free_shipping_active: true,
  shipping_options: [], whatsapp_number: '', cs_hours: '', cs_hours_note: '', social: {},
}

// Store-wide reference data (settings incl. WhatsApp number + free-shipping rule, category tree).
// Reloaded when the UI language changes so category names follow it.
export function StoreProvider({ children }) {
  const { i18n } = useTranslation()
  const [settings, setSettings] = useState(DEFAULTS)
  const [categories, setCategories] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let off = false
    Promise.all([getSettings().catch(() => null), getCategoryTree().catch(() => [])]).then(([s, c]) => {
      if (off) return
      if (s) setSettings({ ...DEFAULTS, ...s })
      setCategories(c || [])
      setReady(true)
    })
    return () => { off = true }
  }, [i18n.language])

  const value = useMemo(() => {
    // One rule drives every free-shipping spot (home strip, bar, PDP line, cart, checkout...). The
    // backend recomputes the real shipping fee, this is only the message.
    const threshold = settings.free_shipping_active ? Number(settings.free_shipping_minimarket) || 0 : 0
    const freeShip = (subtotal) => ({
      active: threshold > 0,
      threshold,
      remaining: Math.max(0, Math.round(threshold - subtotal)),
      reached: threshold > 0 && subtotal >= threshold,
      pct: threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 0,
    })
    const chainFee = (type) => {
      const c = (settings.shipping_options || []).find((o) => o.chain_type === type)
      return c ? c.fee : 0
    }
    const chainId = (type) => (settings.shipping_options || []).find((o) => o.chain_type === type)?.id || 0
    return { settings, categories, ready, freeShip, threshold, chainFee, chainId }
  }, [settings, categories, ready])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const KEY = 'ralulu_cart_v1'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

// Cart lives in localStorage only (guest checkout). Prices shown here are for display; the
// server re-prices every line from the database on /quote and /orders.
export function CartProvider({ children }) {
  const [items, setItems] = useState(load)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* private mode */ }
  }, [items])

  const api = useMemo(() => ({
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    subtotal: items.reduce((s, i) => s + i.qty * i.price, 0),
    drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    add(item, qty = 1) {
      setItems((cur) => {
        const found = cur.find((i) => i.variantId === item.variantId)
        const max = item.stock || 99
        if (found) return cur.map((i) => (i.variantId === item.variantId ? { ...i, ...item, qty: Math.min(i.qty + qty, max) } : i))
        return [...cur, { ...item, qty: Math.min(qty, max) }]
      })
      setDrawerOpen(true)
    },
    setQty(variantId, qty) {
      setItems((cur) => cur.flatMap((i) => {
        if (i.variantId !== variantId) return [i]
        if (qty <= 0) return []
        return [{ ...i, qty: Math.min(qty, i.stock || 99) }]
      }))
    },
    remove: (variantId) => setItems((cur) => cur.filter((i) => i.variantId !== variantId)),
    clear: () => setItems([]),
  }), [items, drawerOpen])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)

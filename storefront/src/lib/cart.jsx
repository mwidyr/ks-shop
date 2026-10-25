import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProduct } from './api'

const CartContext = createContext(null)
const KEY = 'ralulu_cart_v2'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

// Cart lives on the device (guest checkout). Prices here are display-only: the server re-prices every
// line on /quote and /orders. `selected` = ticked for checkout ("Dipilih 2 item").
export function CartProvider({ children }) {
  const [items, setItems] = useState(load)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* private mode */ }
  }, [items])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Names and colours in the cart were saved in the language the product was added in. When the language changes,
  // fetch them again in the new one so the cart and the CS message follow the selected language.
  const { i18n } = useTranslation()
  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))]
    if (ids.length === 0) return undefined
    let off = false
    Promise.all(ids.map((id) => getProduct(id).catch(() => null))).then((list) => {
      if (off) return
      const byProduct = new Map(list.filter(Boolean).map((p) => [p.id, p]))
      setItems((cur) => cur.map((i) => {
        const p = byProduct.get(i.productId)
        const v = p?.variants?.find((x) => x.id === i.variantId)
        if (!p) return i
        const name = p.name || i.name
        const color = v ? v.color : i.color
        return name === i.name && color === i.color ? i : { ...i, name, color }
      }))
    })
    return () => { off = true }
    // only on a language change (and first load): not on every cart edit
  }, [i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg) => setToast({ msg, id: Date.now() }), [])

  const api = useMemo(() => {
    const selected = items.filter((i) => i.selected !== false)
    return {
      items,
      selected,
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal: items.reduce((s, i) => s + i.qty * i.price, 0),
      selectedCount: selected.reduce((s, i) => s + i.qty, 0),
      selectedSubtotal: selected.reduce((s, i) => s + i.qty * i.price, 0),
      toast,
      showToast,
      add(item, qty = 1, quiet = false) {
        setItems((cur) => {
          const found = cur.find((i) => i.variantId === item.variantId)
          const max = item.stock || 99
          if (found) return cur.map((i) => (i.variantId === item.variantId ? { ...i, ...item, selected: true, qty: Math.min(i.qty + qty, max) } : i))
          return [...cur, { ...item, selected: true, qty: Math.min(qty, max) }]
        })
        if (!quiet) setToast({ msg: 'added', id: Date.now() })
      },
      setQty(variantId, qty) {
        setItems((cur) => cur.flatMap((i) => {
          if (i.variantId !== variantId) return [i]
          if (qty <= 0) return []
          return [{ ...i, qty: Math.min(qty, i.stock || 99) }]
        }))
      },
      toggle: (variantId) => setItems((cur) => cur.map((i) => (i.variantId === variantId ? { ...i, selected: i.selected === false } : i))),
      toggleAll(on) { setItems((cur) => cur.map((i) => ({ ...i, selected: on }))) },
      remove: (variantId) => setItems((cur) => cur.filter((i) => i.variantId !== variantId)),
      removeSelected: () => setItems((cur) => cur.filter((i) => i.selected === false)),
      clear: () => setItems([]),
    }
  }, [items, toast, showToast])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)

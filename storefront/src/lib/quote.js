import { useEffect, useState } from 'react'
import { quoteCart } from './api'

// Server-authoritative totals for the selected items (+ coupon + pickup method), debounced. The UI
// never computes shipping itself: it only shows what the backend says (no "free shipping on screen,
// shipping charged at checkout" mismatch).
export function useQuote({ items, pickupChainId, code, phone, useBalance, usePoints }) {
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const key = JSON.stringify([items.map((i) => [i.variantId, i.qty]), pickupChainId, code, phone, useBalance, usePoints])

  useEffect(() => {
    if (items.length === 0) { setQuote(null); return undefined }
    let cancelled = false
    const t = setTimeout(() => {
      quoteCart({
        items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
        pickup_chain_id: pickupChainId || 0,
        promotion_code: code || '',
        phone: phone || '',
        use_balance: Boolean(useBalance),
        use_points: Boolean(usePoints),
      }).then((q) => { if (!cancelled) { setQuote(q); setError('') } })
        .catch((e) => { if (!cancelled) { setQuote(null); setError(e.message) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { quote, error }
}

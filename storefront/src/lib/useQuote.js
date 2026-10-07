import { useEffect, useState } from 'react'
import { quoteCart } from './api'

// Server-authoritative totals for the current cart (+ coupon + pickup method), debounced.
export function useQuote({ items, pickupChainId, code, phone }) {
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const key = JSON.stringify([items.map((i) => [i.variantId, i.qty]), pickupChainId, code, phone])

  useEffect(() => {
    if (items.length === 0) { setQuote(null); return undefined }
    let cancelled = false
    const t = setTimeout(() => {
      quoteCart({
        items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
        pickup_chain_id: pickupChainId || 0,
        promotion_code: code || '',
        phone: phone || '',
      }).then((q) => { if (!cancelled) { setQuote(q); setError('') } })
        .catch((e) => { if (!cancelled) { setQuote(null); setError(e.message) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { quote, error }
}

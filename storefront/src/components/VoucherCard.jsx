import { useState } from 'react'
import { promoLabel } from '../lib/format'

// A coupon the shopper can copy and paste at checkout (the same "tap to copy" voucher blocks
// the reference store uses).
export default function VoucherCard({ promo }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(promo.code)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = promo.code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="flex border border-dashed border-brand-600 bg-brand-50 min-w-[260px]">
      <div className="flex-1 p-4">
        <p className="text-xs uppercase tracking-wide text-brand-700 font-semibold">Voucher</p>
        <p className="font-semibold mt-0.5">{promoLabel(promo)}</p>
        {promo.end_date && <p className="text-[11px] text-gray-500 mt-1">Berlaku s/d {new Date(promo.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
      </div>
      <button onClick={copy} className="px-4 border-l border-dashed border-brand-600 text-center bg-white hover:bg-brand-600 hover:text-white transition">
        <span className="block font-mono font-bold text-sm">{promo.code}</span>
        <span className="block text-[11px] mt-0.5">{copied ? 'Tersalin!' : 'Salin kode'}</span>
      </button>
    </div>
  )
}

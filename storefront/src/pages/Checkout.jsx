import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createOrder, img } from '../lib/api'
import { useCart } from '../lib/cart'
import { useQuote } from '../lib/useQuote'
import { useStore } from '../lib/useSettings'
import { money } from '../lib/format'

const isCvs = (t) => t === 'cvs_711' || t === 'cvs_familymart'

// Guest checkout: contact + pickup method (7-Eleven / FamilyMart store code, or home address),
// voucher, server-side totals, then POST /orders. Payment is arranged by the team after the
// order is received (an online payment gateway comes later).
export default function Checkout() {
  const cart = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { settings } = useStore()
  const options = settings?.shipping_options || []

  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', storeCode: '', storeName: '', notes: '' })
  const [chainId, setChainId] = useState(0)
  const [code, setCode] = useState((params.get('kode') || '').toUpperCase())
  const [codeInput, setCodeInput] = useState(code)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!chainId && options.length) setChainId(options[0].id) }, [options, chainId])
  const chain = options.find((o) => o.id === chainId)
  const { quote, error: quoteError } = useQuote({ items: cart.items, pickupChainId: chainId, code, phone: form.phone.trim().length >= 8 ? form.phone.trim() : '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (cart.items.length === 0) {
    return <div className="max-w-xl mx-auto py-24 text-center"><p>Keranjangmu kosong.</p><Link to="/produk" className="btn btn-dark mt-6">Mulai belanja</Link></div>
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (isCvs(chain?.chain_type) && !/^\d{6}$/.test(form.storeCode)) { setError('Kode toko harus 6 digit angka.'); return }
    setSubmitting(true)
    try {
      const res = await createOrder({
        items: cart.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
        pickup_chain_id: chainId,
        promotion_code: code,
        name: form.name, phone: form.phone, email: form.email, notes: form.notes,
        address: form.address, pickup_store_code: form.storeCode, pickup_store_name: form.storeName,
      })
      cart.clear()
      navigate(`/pesanan/${res.order_no}`, { state: { order: res, phone: form.phone }, replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-8">
      <h1 className="font-display text-4xl tracking-wide">CHECKOUT</h1>
      <form onSubmit={submit} className="grid lg:grid-cols-[1fr_380px] gap-10 mt-6">
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold uppercase tracking-wide text-sm mb-3">Kontak</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className="input" required placeholder="Nama lengkap" value={form.name} onChange={set('name')} maxLength={150} autoComplete="name" />
              <input className="input" required placeholder="Nomor HP (mis. 0912345678)" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
              <input className="input sm:col-span-2" type="email" placeholder="Email (opsional)" value={form.email} onChange={set('email')} autoComplete="email" />
            </div>
          </section>

          <section>
            <h2 className="font-semibold uppercase tracking-wide text-sm mb-3">Metode pengambilan</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {options.map((o) => (
                <label key={o.id} className={`border p-3 cursor-pointer flex items-center justify-between ${o.id === chainId ? 'border-black bg-gray-50' : ''}`}>
                  <span className="flex items-center gap-2"><input type="radio" name="chain" checked={o.id === chainId} onChange={() => setChainId(o.id)} />{o.name}</span>
                  <span className="text-xs text-gray-500">{o.fee > 0 ? money(o.fee) : 'Gratis'}</span>
                </label>
              ))}
            </div>
            {isCvs(chain?.chain_type) ? (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <input className="input" required placeholder="Kode toko (6 digit)" value={form.storeCode} onChange={(e) => setForm((f) => ({ ...f, storeCode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" />
                <input className="input" placeholder="Nama toko (opsional)" value={form.storeName} onChange={set('storeName')} />
              </div>
            ) : (
              <textarea className="input mt-3" required rows={3} placeholder="Alamat lengkap pengiriman" value={form.address} onChange={set('address')} />
            )}
          </section>

          <section>
            <h2 className="font-semibold uppercase tracking-wide text-sm mb-3">Catatan</h2>
            <textarea className="input" rows={2} placeholder="Catatan untuk pesananmu (opsional)" value={form.notes} onChange={set('notes')} />
          </section>
        </div>

        <aside className="border p-5 h-fit space-y-4 lg:sticky lg:top-28">
          <h2 className="font-semibold uppercase tracking-wide text-sm">Pesananmu</h2>
          <ul className="divide-y max-h-64 overflow-y-auto">
            {cart.items.map((i) => (
              <li key={i.variantId} className="flex gap-3 py-3 text-sm">
                <div className="w-14 h-[70px] bg-gray-100 shrink-0 overflow-hidden">{i.image && <img src={img(i.image)} alt="" className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0"><p className="line-clamp-2">{i.name}</p><p className="text-xs text-gray-500">{[i.color, i.size].filter(Boolean).join(' / ')} × {i.qty}</p></div>
                <p className="font-medium">{money(i.price * i.qty)}</p>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input className="input uppercase" placeholder="Kode voucher" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
            <button type="button" className="btn btn-outline !px-4" onClick={() => setCode(codeInput.trim().toUpperCase())}>Pakai</button>
          </div>
          {quote?.promotion_error && <p className="text-xs text-red-600">{quote.promotion_error}</p>}

          <dl className="text-sm space-y-2 border-t pt-4">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(quote?.subtotal ?? cart.subtotal)}</dd></div>
            {quote?.discount > 0 && <div className="flex justify-between text-green-700"><dt>Voucher {code}</dt><dd>-{money(quote.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Ongkir</dt><dd>{quote ? (quote.shipping_fee > 0 ? money(quote.shipping_fee) : 'Gratis') : '-'}</dd></div>
            <div className="flex justify-between font-semibold text-base border-t pt-3"><dt>Total</dt><dd>{money(quote?.total ?? cart.subtotal)}</dd></div>
          </dl>

          {(error || quoteError) && <p className="text-sm text-red-600">{error || quoteError}</p>}
          <button className="btn btn-dark w-full !py-4" disabled={submitting || !quote}>{submitting ? 'Memproses…' : 'Buat pesanan'}</button>
          <p className="text-[11px] text-gray-500 leading-relaxed">Setelah pesanan dibuat, tim kami menghubungi kamu lewat nomor HP untuk konfirmasi dan pembayaran. Simpan nomor pesanan untuk melacak.</p>
        </aside>
      </form>
    </div>
  )
}

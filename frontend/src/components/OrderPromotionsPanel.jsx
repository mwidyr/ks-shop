import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { availablePromotions, listPromotionPurposes, previewPromotions } from '../api/promotions'
import { formatCurrency } from '../utils/format'

export const emptyPromotionState = () => ({ code: '', promotionIds: [], excludedIds: [], giftChoices: {}, purposeId: '' })

// What the order request carries for a promotion state.
export function promotionPayload(state) {
  return {
    promotion_code: state.code || '',
    promotion_ids: state.promotionIds,
    excluded_promotion_ids: state.excludedIds,
    gift_choices: state.giftChoices,
    promotion_purpose_id: Number(state.purposeId) || 0,
  }
}

// Coupon code + CS-only / existing promotions + automatic ones, with a live preview from the server (the same engine
// that creates the order). items: [{variant_id, qty}] or orderId for an existing order. salesChannel decides what CS can
// pick: LIVE = CS-only promotions, Website = website + CS-only promotions (a typed code works on both).
export default function OrderPromotionsPanel({ items, orderId, customerId, pickupChainId, salesChannel = 'live', state, onChange, onPreview }) {
  const { t } = useTranslation()
  const pt = (k, o) => t(`shared.promo_panel.${k}`, o)
  const [available, setAvailable] = useState([])
  const [availableFor, setAvailableFor] = useState('')
  const [purposes, setPurposes] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [pick, setPick] = useState('')
  const seq = useRef(0)
  const onPreviewRef = useRef(onPreview)
  onPreviewRef.current = onPreview

  useEffect(() => { listPromotionPurposes(true).then(setPurposes).catch(() => {}) }, [])
  useEffect(() => {
    let live = true
    availablePromotions(salesChannel).then((list) => { if (live) { setAvailable(list); setAvailableFor(salesChannel) } }).catch(() => {})
    return () => { live = false }
  }, [salesChannel])
  // a promotion that is no longer allowed for this Sales Channel (e.g. a website promotion after switching to LIVE) is dropped
  useEffect(() => {
    if (availableFor !== salesChannel) return
    const ok = new Set(available.map((a) => a.id))
    const kept = state.promotionIds.filter((id) => ok.has(id))
    if (kept.length !== state.promotionIds.length) onChange({ ...state, promotionIds: kept })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, availableFor, salesChannel])

  const body = useMemo(() => ({
    items: (items || []).map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
    order_id: orderId || 0,
    customer_id: customerId || null,
    pickup_chain_id: Number(pickupChainId) || 0,
    sales_channel: salesChannel,
    code: state.code,
    promotion_ids: state.promotionIds,
    excluded_ids: state.excludedIds,
    gift_choices: state.giftChoices,
  }), [items, orderId, customerId, pickupChainId, salesChannel, state])

  useEffect(() => {
    const id = ++seq.current
    const timer = setTimeout(() => {
      setLoading(true)
      previewPromotions(body).then((res) => {
        if (id !== seq.current) return
        setPreview(res); onPreviewRef.current?.(res)
      }).catch(() => { if (id === seq.current) { setPreview(null); onPreviewRef.current?.(null) } })
        .finally(() => { if (id === seq.current) setLoading(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [body])

  const byId = useMemo(() => Object.fromEntries(available.map((a) => [a.id, a])), [available])
  const pickable = available.filter((a) => !a.auto_apply && !state.promotionIds.includes(a.id))
  const autoApplied = (preview?.applied || []).filter((a) => byId[a.promotion_id]?.auto_apply)
  const excludedAutos = state.excludedIds.map((id) => byId[id]).filter(Boolean)
  // every promotion CS picks from the list needs a purpose (typed codes and automatic promotions are General Promotion)
  const needsPurpose = state.promotionIds.length > 0

  async function applyCode() {
    const code = codeInput.trim().toUpperCase()
    if (!code) return
    setCodeError('')
    try {
      const res = await previewPromotions({ ...body, code })
      if (res.error) { setCodeError(res.error); return }
      onChange({ ...state, code })
      setCodeInput('')
    } catch { setCodeError(pt('code_invalid')) }
  }

  const label = (a) => a.name || a.code
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{pt('code_label')}</label>
        {state.code ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-sm font-semibold text-green-700 font-mono">{state.code}</p>
            <button type="button" onClick={() => onChange({ ...state, code: '' })} className="text-xs font-semibold text-red-600 hover:underline">{pt('remove')}</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }} placeholder={pt('code_placeholder')} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase" />
            <button type="button" onClick={applyCode} disabled={!codeInput.trim()} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-lg">{pt('apply')}</button>
          </div>
        )}
        {codeError && <p className="text-xs text-red-600 mt-1">{codeError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{pt('pick_label')}</label>
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">{pt('pick_placeholder')}</option>
            {pickable.map((a) => <option key={a.id} value={a.id}>{label(a)}{a.audience === 'cs_only' ? ` · ${pt('cs_only')}` : ` · ${pt('website_promo')}`}</option>)}
          </select>
          <button type="button" disabled={!pick} onClick={() => { onChange({ ...state, promotionIds: [...state.promotionIds, Number(pick)] }); setPick('') }} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-lg">{pt('add')}</button>
        </div>
        {state.promotionIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {state.promotionIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2.5 py-0.5 text-xs">
                {byId[id] ? label(byId[id]) : `#${id}`}
                <button type="button" aria-label={pt('remove')} onClick={() => onChange({ ...state, promotionIds: state.promotionIds.filter((x) => x !== id) })}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {(autoApplied.length > 0 || excludedAutos.length > 0) && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">{pt('auto_label')}</p>
          <ul className="space-y-1">
            {autoApplied.map((a) => (
              <li key={a.promotion_id} className="flex items-center justify-between text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                <span>{a.label}</span>
                <button type="button" onClick={() => onChange({ ...state, excludedIds: [...state.excludedIds, a.promotion_id] })} className="text-xs font-semibold text-red-600 hover:underline">{pt('remove')}</button>
              </li>
            ))}
            {excludedAutos.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-500">
                <span className="line-through">{label(a)}</span>
                <button type="button" onClick={() => onChange({ ...state, excludedIds: state.excludedIds.filter((x) => x !== a.id) })} className="text-xs font-semibold text-brand-600 hover:underline">{pt('restore')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (preview.gifts || []).length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">{pt('gifts_label')}</p>
          {preview.gifts.map((g) => {
            const options = byId[g.promotion_id]?.gifts || []
            return (
              <div key={`${g.promotion_id}-${g.variant_id}`} className="flex items-center gap-2 text-sm bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                <span className="flex-1">{options.length > 1 ? (
                  <select value={state.giftChoices[g.promotion_id] || g.variant_id} onChange={(e) => onChange({ ...state, giftChoices: { ...state.giftChoices, [g.promotion_id]: Number(e.target.value) } })} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                    {options.map((o) => <option key={o.variant_id} value={o.variant_id}>{o.name}</option>)}
                  </select>
                ) : g.name}</span>
                <span className="text-xs text-gray-500">× {g.qty}</span>
                <span className="text-xs font-semibold text-green-700">{pt('free')}</span>
              </div>
            )
          })}
        </div>
      )}

      {needsPurpose && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{pt('purpose_label')}</label>
          <select value={state.purposeId} onChange={(e) => onChange({ ...state, purposeId: e.target.value })} className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${state.purposeId ? 'border-gray-300' : 'border-amber-400'}`}>
            <option value="">{pt('purpose_placeholder')}</option>
            {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {preview && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${loading ? 'opacity-60' : ''} ${preview.applied?.length ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
          {preview.applied?.length ? (
            <ul className="space-y-0.5">
              {preview.applied.map((a) => (
                <li key={a.promotion_id} className="flex justify-between gap-2">
                  <span>{a.label}</span>
                  <span className="text-green-700 font-semibold">
                    {a.free_shipping ? pt('free_shipping') : a.discount > 0 ? `-${formatCurrency(a.discount)}` : pt('free_gift')}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-gray-400">{pt('none_applied')}</p>}
          {(preview.notes || []).includes('code_not_used') && <p className="text-xs text-amber-700 mt-1">{pt('code_not_used')}</p>}
          {preview.error && <p className="text-xs text-red-600 mt-1">{preview.error}</p>}
        </div>
      )}
    </div>
  )
}

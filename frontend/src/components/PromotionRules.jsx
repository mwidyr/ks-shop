import { useTranslation } from 'react-i18next'
import { ProductSearch, VariantPicker, btnGhost, productNameById, useProductList, variantLabelById } from './website/Pickers'

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm'
const lbl = 'block text-[11px] text-gray-500 mb-1'

// "Black, White" / "A-1, B-2" -> ['Black','White']
export const splitList = (text) => String(text || '').split(/[,\n，]/).map((s) => s.trim()).filter(Boolean)

export const emptyMatcher = () => ({ product_ids: [], colors: '', skus: '' })

export function matcherToPayload(m) {
  return { product_ids: m.product_ids, colors: splitList(m.colors), skus: splitList(m.skus) }
}
export function matcherFromConfig(m) {
  return { product_ids: m?.product_ids || [], colors: (m?.colors || []).join(', '), skus: (m?.skus || []).join(', ') }
}

// A product / colour / SKU filter: products are picked from the catalogue, colours and SKUs are typed.
function MatcherEditor({ title, value, onChange }) {
  const { t } = useTranslation()
  const p = (k, o) => t(`page_promotions.${k}`, o)
  const products = useProductList()
  return (
    <div className="col-span-2 border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {value.product_ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-xs">
            {productNameById(products, id)}
            <button type="button" aria-label="remove" onClick={() => onChange({ ...value, product_ids: value.product_ids.filter((x) => x !== id) })}>×</button>
          </span>
        ))}
      </div>
      <ProductSearch placeholder={p('matcher_add_product')} onPick={(pr) => !value.product_ids.includes(pr.id) && onChange({ ...value, product_ids: [...value.product_ids, pr.id] })} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>{p('matcher_colors')}</label>
          <input value={value.colors} onChange={(e) => onChange({ ...value, colors: e.target.value })} placeholder={p('matcher_colors_hint')} className={input} />
        </div>
        <div>
          <label className={lbl}>{p('matcher_skus')}</label>
          <input value={value.skus} onChange={(e) => onChange({ ...value, skus: e.target.value })} placeholder={p('matcher_skus_hint')} className={input} />
        </div>
      </div>
      <p className="text-[11px] text-gray-400">{p('matcher_hint')}</p>
    </div>
  )
}

const num = (v, set, label, hint, min = 0) => (
  <div>
    <label className={lbl}>{label}</label>
    <input type="number" min={min} value={v} onChange={(e) => set(e.target.value)} placeholder={hint} className={input} />
  </div>
)

// The rules of a product promotion (Buy A Get B / Add-on / Combo). cfg lives in the form state of Promotions.jsx.
export default function PromotionRules({ type, cfg, setCfg }) {
  const { t } = useTranslation()
  const p = (k, o) => t(`page_promotions.${k}`, o)
  const products = useProductList()
  const set = (patch) => setCfg({ ...cfg, ...patch })
  if (type === 'buy_a_get_b') {
    return (
      <>
        <MatcherEditor title={p('trigger_label')} value={cfg.trigger} onChange={(v) => set({ trigger: v })} />
        {num(cfg.trigger_qty, (v) => set({ trigger_qty: v }), p('trigger_qty_label'), '1', 1)}
        {num(cfg.gift_qty, (v) => set({ gift_qty: v }), p('gift_qty_label'), '1', 1)}
        <div className="col-span-2 border border-gray-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">{p('gifts_label')}</p>
          <p className="text-[11px] text-gray-400">{p('gifts_hint')}</p>
          <ul className="text-sm space-y-1">
            {cfg.gifts.map((vid, i) => (
              <li key={vid} className="flex items-center gap-2">
                <span className="flex-1 truncate">{variantLabelById(products, vid)}{i === 0 && <span className="ml-2 text-[11px] text-green-700">{p('gift_default')}</span>}</span>
                <button type="button" onClick={() => set({ gifts: cfg.gifts.filter((x) => x !== vid) })} className={btnGhost}>×</button>
              </li>
            ))}
          </ul>
          <VariantPicker onPick={(v) => !cfg.gifts.includes(v.id) && set({ gifts: [...cfg.gifts, v.id] })} />
        </div>
        {num(cfg.max_sets, (v) => set({ max_sets: v }), p('max_sets_label'), p('unlimited'), 1)}
      </>
    )
  }
  if (type === 'addon') {
    return (
      <>
        <MatcherEditor title={p('trigger_label')} value={cfg.trigger} onChange={(v) => set({ trigger: v })} />
        {num(cfg.trigger_qty, (v) => set({ trigger_qty: v }), p('addon_trigger_qty_label'), '1', 1)}
        <div />
        <MatcherEditor title={p('addon_label')} value={cfg.addon} onChange={(v) => set({ addon: v })} />
        {num(cfg.addon_price, (v) => set({ addon_price: v }), p('addon_price_label'), '')}
        {num(cfg.max_qty, (v) => set({ max_qty: v }), p('max_qty_label'), p('unlimited'), 1)}
      </>
    )
  }
  if (type === 'combo') {
    return (
      <>
        <MatcherEditor title={p('pool_label')} value={cfg.pool} onChange={(v) => set({ pool: v })} />
        {num(cfg.required_qty, (v) => set({ required_qty: v }), p('required_qty_label'), '2', 2)}
        {num(cfg.combo_price, (v) => set({ combo_price: v }), p('combo_price_label'), '')}
        {num(cfg.max_sets, (v) => set({ max_sets: v }), p('max_sets_label'), p('unlimited'), 1)}
        <label className="flex items-center gap-2 text-sm text-gray-700 self-end pb-1.5">
          <input type="checkbox" checked={cfg.distinct} onChange={(e) => set({ distinct: e.target.checked })} className="w-4 h-4" />
          {p('distinct_label')}
        </label>
      </>
    )
  }
  return null
}

export const PRODUCT_TYPES = ['buy_a_get_b', 'addon', 'combo']

export function emptyConfig(type) {
  if (type === 'buy_a_get_b') return { trigger: emptyMatcher(), trigger_qty: '1', gifts: [], gift_qty: '1', max_sets: '' }
  if (type === 'addon') return { trigger: emptyMatcher(), trigger_qty: '1', addon: emptyMatcher(), addon_price: '', max_qty: '' }
  if (type === 'combo') return { pool: emptyMatcher(), required_qty: '2', combo_price: '', max_sets: '', distinct: false }
  return {}
}

const n = (v) => (v === '' || v == null ? 0 : Number(v) || 0)

export function configToPayload(type, c) {
  if (type === 'buy_a_get_b') return { trigger: matcherToPayload(c.trigger), trigger_qty: n(c.trigger_qty) || 1, gifts: c.gifts.map((id) => ({ variant_id: id })), gift_qty: n(c.gift_qty) || 1, max_sets: n(c.max_sets) }
  if (type === 'addon') return { trigger: matcherToPayload(c.trigger), trigger_qty: n(c.trigger_qty) || 1, addon: matcherToPayload(c.addon), addon_price: n(c.addon_price), max_qty: n(c.max_qty) }
  if (type === 'combo') return { pool: matcherToPayload(c.pool), required_qty: n(c.required_qty), combo_price: n(c.combo_price), max_sets: n(c.max_sets), distinct: !!c.distinct }
  return {}
}

export function configFromPromotion(type, cfg) {
  const c = cfg || {}
  if (type === 'buy_a_get_b') return { trigger: matcherFromConfig(c.trigger), trigger_qty: String(c.trigger_qty || 1), gifts: (c.gifts || []).map((g) => g.variant_id), gift_qty: String(c.gift_qty || 1), max_sets: c.max_sets ? String(c.max_sets) : '' }
  if (type === 'addon') return { trigger: matcherFromConfig(c.trigger), trigger_qty: String(c.trigger_qty || 1), addon: matcherFromConfig(c.addon), addon_price: c.addon_price != null ? String(c.addon_price) : '', max_qty: c.max_qty ? String(c.max_qty) : '' }
  if (type === 'combo') return { pool: matcherFromConfig(c.pool), required_qty: String(c.required_qty || 2), combo_price: c.combo_price ? String(c.combo_price) : '', max_sets: c.max_sets ? String(c.max_sets) : '', distinct: !!c.distinct }
  return {}
}

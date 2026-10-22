import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listPromotions } from '../api/promotions'
import { getSiteHost, listSiteHosts, saveSiteHost } from '../api/website'
import { uploadImageFile } from '../utils/image'
import { btnCls, btnGhost, cardCls, inputCls, ProductSearch, useProductList, variantLabelById, VariantPicker } from '../components/website/Pickers'

const BLOCKS = ['intro', 'live', 'coupons', 'outfits', 'picks', 'journal', 'wardrobe']

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function ImageField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false)
  async function pick(e) {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true)
    try { onChange(await uploadImageFile(f)) } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="w-16 h-16 object-cover rounded-lg bg-gray-100" /> : <div className="w-16 h-16 rounded-lg bg-gray-100" />}
        <input type="file" accept="image/*" onChange={pick} className="text-xs" disabled={busy} />
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="https://..." />
      </div>
    </Field>
  )
}

// Optional parts stay folded so the page opens on the essentials (profile + products).
function Fold({ title, hint, children }) {
  return (
    <details className={`${cardCls} group`}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <span className="font-bold text-gray-800">{title}{hint && <span className="text-xs font-normal text-gray-400"> ({hint})</span>}</span>
        <span className="text-gray-400 text-sm transition-transform group-open:rotate-180" aria-hidden>⌄</span>
      </summary>
      <div className="space-y-3 pt-4">{children}</div>
    </details>
  )
}

export default function WebsiteHosts() {
  const { t } = useTranslation()
  const h = (k, o) => t(`page_website.hosts.${k}`, o)
  const products = useProductList()
  const [hosts, setHosts] = useState([])
  const [promos, setPromos] = useState([])
  const [sel, setSel] = useState(null)
  const [p, setP] = useState(null)
  const [rel, setRel] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadList = () => listSiteHosts().then(setHosts).catch(() => {})
  useEffect(() => { loadList(); listPromotions().then(setPromos).catch(() => {}) }, [])

  async function open(id) {
    setSel(id); setMsg(null); setP(null)
    const d = await getSiteHost(id)
    setP(d.profile)
    setRel({ products: d.relations.products || [], outfits: d.relations.outfits || [], coupons: d.relations.coupons || [] })
  }
  const set = (patch) => setP((cur) => ({ ...cur, ...patch }))

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const body = {
        profile: { ...p, height_cm: p.height_cm === '' ? null : p.height_cm, weight_kg: p.weight_kg === '' ? null : p.weight_kg },
        relations: {
          products: rel.products.map((x) => ({ product_id: x.product_id, kind: x.kind, wear_size: x.wear_size || '' })),
          outfits: rel.outfits.map((o) => ({ title: o.title, tag: o.tag || '', variant_ids: o.variant_ids })),
          coupons: rel.coupons.map((c) => ({ promotion_id: c.promotion_id, title: c.title || '', subtitle: c.subtitle || '' })),
        },
      }
      await saveSiteHost(sel, body)
      setMsg({ ok: true, text: h('saved') })
      loadList(); open(sel)
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') })
    } finally { setSaving(false) }
  }

  const upd = (key, i, patch) => setRel((cur) => ({ ...cur, [key]: cur[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const del = (key, i) => setRel((cur) => ({ ...cur, [key]: cur[key].filter((_, j) => j !== i) }))

  return (
    <div className="px-4 sm:px-6 py-6 grid lg:grid-cols-[280px_1fr] gap-4 items-start">
      <div className={`${cardCls} lg:sticky lg:top-4`}>
        <h1 className="font-bold text-gray-800">{h('title')}</h1>
        <p className="text-xs text-gray-500 mb-3">{h('intro')}</p>
        <ul className="space-y-1">
          {hosts.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => open(x.id)} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm ${sel === x.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-gray-50'}`}>
                {x.avatar_url ? <img src={x.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-gray-200" />}
                <span className="flex-1 truncate">{x.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${x.is_public ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{x.is_public ? h('public') : h('private')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {p && rel && (
        <div className="space-y-4 min-w-0 pb-4">
          {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
          <div className={`${cardCls} space-y-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-gray-800">{p.name}</h2>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={p.is_public} onChange={(e) => set({ is_public: e.target.checked })} className="w-5 h-5" />{h('public')}</label>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={h('slug')} hint={p.slug_locked ? `${h('slug_locked')} · ${h('slug_hint')}` : h('slug_hint')}>
                <input value={p.slug || ''} disabled={p.slug_locked} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} className={`${inputCls} ${p.slug_locked ? 'bg-gray-100' : ''}`} />
              </Field>
              <Field label={h('alias')}><input value={(p.alias || []).join(', ')} onChange={(e) => set({ alias: e.target.value.split(',').map((s) => s.trim()) })} className={inputCls} /></Field>
              <ImageField label={h('avatar')} value={p.avatar_url} onChange={(v) => set({ avatar_url: v })} />
              <ImageField label={h('cover')} value={p.cover_url} onChange={(v) => set({ cover_url: v })} />
            </div>
            <Field label={h('bio')}><textarea rows={3} value={p.bio || ''} onChange={(e) => set({ bio: e.target.value })} className={inputCls} /></Field>
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <Field label={h('order')}><input type="number" value={p.display_order} onChange={(e) => set({ display_order: Number(e.target.value) })} className={inputCls} /></Field>
              <p className="text-xs text-gray-500">{h('live_moved')} <Link to="/website/live" className="text-brand-600 underline">{h('live_moved_link')}</Link></p>
            </div>
          </div>

          <Fold title={h('body')} hint={t('page_website.common.optional')}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label={h('height')}><input type="number" value={p.height_cm ?? ''} onChange={(e) => set({ height_cm: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls} /></Field>
              <Field label={h('weight')}><input type="number" value={p.weight_kg ?? ''} onChange={(e) => set({ weight_kg: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls} /></Field>
              <Field label={h('usual')}><input value={p.usual_size || ''} onChange={(e) => set({ usual_size: e.target.value })} className={inputCls} /></Field>
              <Field label={h('style')}><input value={p.style_note || ''} onChange={(e) => set({ style_note: e.target.value })} className={inputCls} /></Field>
              <Field label={h('favorites')}><input value={p.favorites || ''} onChange={(e) => set({ favorites: e.target.value })} className={inputCls} /></Field>
            </div>
          </Fold>

          <div className={`${cardCls} space-y-3`}>
            <h2 className="font-bold text-gray-800">{h('products')}</h2>
            <p className="text-xs text-gray-500">{h('products_hint')}</p>
            {rel.products.map((x, i) => (
              <div key={`${x.product_id}-${x.kind}-${i}`} className="flex gap-2 items-center flex-wrap">
                <span className="flex-1 min-w-[160px] text-sm truncate">{x.name || products.find((q) => q.id === x.product_id)?.name || `#${x.product_id}`}</span>
                <select value={x.kind} onChange={(e) => upd('products', i, { kind: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="showing">{h('k_showing')}</option><option value="worn">{h('k_worn')}</option><option value="pick">{h('k_pick')}</option>
                </select>
                <input value={x.wear_size || ''} onChange={(e) => upd('products', i, { wear_size: e.target.value })} placeholder={h('wear_size')} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-28" />
                <button type="button" onClick={() => del('products', i)} className={btnGhost}>{t('page_website.common.remove')}</button>
              </div>
            ))}
            <ProductSearch placeholder={h('add_product')} onPick={(pr) => setRel((cur) => ({ ...cur, products: [...cur.products, { product_id: pr.id, name: pr.name, kind: 'worn', wear_size: '' }] }))} />
          </div>

          <Fold title={h('outfits')}>
            {rel.outfits.map((o, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={o.title} onChange={(e) => upd('outfits', i, { title: e.target.value })} placeholder={h('outfit_title')} className={inputCls} />
                  <input value={o.tag || ''} onChange={(e) => upd('outfits', i, { tag: e.target.value })} placeholder={h('outfit_tag')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40" />
                  <button type="button" onClick={() => del('outfits', i)} className={btnGhost}>{t('page_website.common.remove')}</button>
                </div>
                <ul className="text-sm space-y-1">
                  {o.variant_ids.map((vid, j) => (
                    <li key={vid} className="flex items-center gap-2"><span className="flex-1 truncate">{variantLabelById(products, vid)}</span><button type="button" onClick={() => upd('outfits', i, { variant_ids: o.variant_ids.filter((_, k) => k !== j) })} className={btnGhost}>×</button></li>
                  ))}
                </ul>
                <VariantPicker onPick={(v) => upd('outfits', i, { variant_ids: [...o.variant_ids, v.id] })} />
              </div>
            ))}
            <button type="button" onClick={() => setRel((cur) => ({ ...cur, outfits: [...cur.outfits, { title: '', tag: '', variant_ids: [] }] }))} className={btnGhost}>{h('add_outfit')}</button>
          </Fold>

          <Fold title={h('coupons')}>
            {rel.coupons.map((c, i) => (
              <div key={i} className="grid sm:grid-cols-[1.2fr_1fr_1fr_auto] gap-2">
                <select value={c.promotion_id} onChange={(e) => upd('coupons', i, { promotion_id: Number(e.target.value) })} className={inputCls}>
                  {promos.filter((x) => x.code).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
                </select>
                <input value={c.title || ''} onChange={(e) => upd('coupons', i, { title: e.target.value })} placeholder={h('coupon_title')} className={inputCls} />
                <input value={c.subtitle || ''} onChange={(e) => upd('coupons', i, { subtitle: e.target.value })} placeholder={h('coupon_sub')} className={inputCls} />
                <button type="button" onClick={() => del('coupons', i)} className={btnGhost}>{t('page_website.common.remove')}</button>
              </div>
            ))}
            <button type="button" onClick={() => { const first = promos.find((x) => x.code); if (first) setRel((cur) => ({ ...cur, coupons: [...cur.coupons, { promotion_id: first.id, title: '', subtitle: '' }] })) }} className={btnGhost}>{h('add_coupon')}</button>
          </Fold>

          <Fold title={h('blocks')}>
            <p className="text-xs text-gray-500">{h('blocks_hint')}</p>
            <div className="flex flex-wrap gap-4">
              {BLOCKS.map((b) => (
                <label key={b} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.blocks?.[b] !== false} onChange={(e) => set({ blocks: { ...p.blocks, [b]: e.target.checked } })} />{h(`b_${b}`)}</label>
              ))}
            </div>
            <h2 className="font-bold text-gray-800 pt-2">{h('seo')}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={h('seo_title')}><input value={p.seo_title || ''} onChange={(e) => set({ seo_title: e.target.value })} className={inputCls} /></Field>
              <Field label={h('seo_desc')}><input value={p.seo_description || ''} onChange={(e) => set({ seo_description: e.target.value })} className={inputCls} /></Field>
            </div>
          </Fold>

          <div className="sticky bottom-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex gap-3 items-center">
            <button type="button" onClick={save} disabled={saving} className={btnCls}>{saving ? t('page_website.common.saving') : t('page_website.common.publish')}</button>
            {p.slug && <a href={`${import.meta.env.VITE_STORE_URL || ''}/hosts/${p.slug}`} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">{h('preview')}</a>}
          </div>
        </div>
      )}
    </div>
  )
}

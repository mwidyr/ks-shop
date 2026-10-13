import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listHosts } from '../../api/hosts'
import { getProductSite, saveProductSite } from '../../api/website'
import { btnCls, btnGhost, cardCls, inputCls, ProductSearch, useProductList } from './Pickers'

// Product edit > Website: live code, try-on video, "complete the look", hosts who show it.
export default function ProductWebsiteSection({ productId }) {
  const { t } = useTranslation()
  const p = (k) => t(`page_website.product.${k}`)
  const products = useProductList()
  const [d, setD] = useState(null)
  const [hosts, setHosts] = useState([])
  const [msg, setMsg] = useState(null)
  useEffect(() => { getProductSite(productId).then(setD).catch(() => {}); listHosts().then(setHosts).catch(() => {}) }, [productId])
  if (!d) return null
  const set = (patch) => setD((cur) => ({ ...cur, ...patch }))
  async function save() {
    setMsg(null)
    try { await saveProductSite(productId, d); setMsg({ ok: true, text: p('saved') }) } catch (e) { setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') }) }
  }
  return (
    <div className={`${cardCls} space-y-4 mt-4`}>
      <div><h2 className="font-bold text-gray-800">{p('title')}</h2><p className="text-xs text-gray-500">{p('intro')}</p></div>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="text-sm font-medium text-gray-700">{p('live_code')}</label><input value={d.live_code || ''} onChange={(e) => set({ live_code: e.target.value })} className={inputCls} placeholder="A12" /><p className="text-xs text-gray-500 mt-1">{p('live_code_hint')}</p></div>
        <div><label className="text-sm font-medium text-gray-700">{p('video')}</label><input value={d.video_url || ''} onChange={(e) => set({ video_url: e.target.value })} className={inputCls} placeholder="https://" /></div>
        <div><label className="text-sm font-medium text-gray-700">{p('poster')}</label><input value={d.video_poster_url || ''} onChange={(e) => set({ video_poster_url: e.target.value })} className={inputCls} placeholder="https://" /></div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">{p('looks')}</label>
        <ul className="space-y-1 my-2">
          {d.complete_the_look.map((id) => <li key={id} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{products.find((x) => x.id === id)?.name || `#${id}`}</span><button type="button" onClick={() => set({ complete_the_look: d.complete_the_look.filter((x) => x !== id) })} className={btnGhost}>×</button></li>)}
        </ul>
        {d.complete_the_look.length < 6 && <ProductSearch placeholder={p('add_look')} onPick={(x) => x.id !== Number(productId) && !d.complete_the_look.includes(x.id) && set({ complete_the_look: [...d.complete_the_look, x.id] })} />}
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">{p('hosts')}</label>
        {(d.hosts || []).map((h, i) => (
          <div key={`${h.host_id}-${i}`} className="flex gap-2 items-center my-1 flex-wrap">
            <select value={h.host_id} onChange={(e) => set({ hosts: d.hosts.map((x, j) => (j === i ? { ...x, host_id: Number(e.target.value) } : x)) })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">{hosts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select value={h.kind} onChange={(e) => set({ hosts: d.hosts.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="showing">{t('page_website.hosts.k_showing')}</option><option value="worn">{t('page_website.hosts.k_worn')}</option><option value="pick">{t('page_website.hosts.k_pick')}</option>
            </select>
            <input value={h.wear_size || ''} onChange={(e) => set({ hosts: d.hosts.map((x, j) => (j === i ? { ...x, wear_size: e.target.value } : x)) })} placeholder={p('wear_size')} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-28" />
            <button type="button" onClick={() => set({ hosts: d.hosts.filter((_, j) => j !== i) })} className={btnGhost}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => hosts[0] && set({ hosts: [...(d.hosts || []), { host_id: hosts[0].id, kind: 'worn', wear_size: '' }] })} className={`${btnGhost} mt-1`}>{p('add_host')}</button>
      </div>
      <button type="button" onClick={save} className={btnCls}>{t('page_website.common.save')}</button>
    </div>
  )
}

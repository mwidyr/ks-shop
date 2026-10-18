import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories } from '../api/categories'
import { listHosts } from '../api/hosts'
import { createContent, deleteContent, getContent, listContent, updateContent } from '../api/website'
import { uploadImageFile } from '../utils/image'
import { productIdsInBlocks } from '../utils/contentBlocks'
import { toEditorBlocks, toStoredBlocks } from '../utils/articleBlocks'
import ArticleBlockEditor from '../components/website/ArticleBlockEditor'
import ArticlePreview from '../components/website/ArticlePreview'
import { btnCls, btnGhost, cardCls, inputCls, ProductSearch, useProductList } from '../components/website/Pickers'

const LANGS = ['id', 'en', 'zh', 'vi']
const TEXT_KEYS = ['title', 'summary', 'category_label', 'cover_alt', 'seo_title', 'seo_description']
const EMPTY = {
  type: 'topic', slug: '', lang: 'id', title: {}, summary: {}, body: {}, category_label: {}, cover_alt: {}, cover_url: '', author_host_id: null, author_name: '', read_minutes: null,
  tags: [], seo_title: {}, seo_description: {}, canonical_url: '', is_published: false, is_indexed: true, is_featured: false, product_ids: [], category_ids: [], host_ids: [],
}
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

function L({ label, hint, children }) {
  return <div><label className="text-sm font-medium text-gray-700">{label}</label>{children}{hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}</div>
}

export default function WebsiteContent() {
  const { t } = useTranslation()
  const c = (k, o) => t(`page_website.content.${k}`, o)
  const products = useProductList()
  const [items, setItems] = useState([])
  const [cats, setCats] = useState([])
  const [hosts, setHosts] = useState([])
  const [form, setForm] = useState(null) // null = list view
  const [blocks, setBlocks] = useState(null) // the body as editor blocks (utils/articleBlocks.js)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)
  const [langFilter, setLangFilter] = useState('')
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => listContent().then(setItems).catch(() => {})
  const lang = form?.lang || 'id'
  useEffect(() => { load(); listCategories().then(setCats).catch(() => {}); listHosts().then(setHosts).catch(() => {}) }, [])

  async function open(id) {
    setMsg(null)
    setSlugTouched(Boolean(id))
    if (!id) { setForm({ ...EMPTY }); setBlocks([]); return }
    const d = await getContent(id)
    setForm(d)
    setBlocks(toEditorBlocks(d.body?.[d.lang] || []))
  }
  const set = (patch) => setForm((cur) => ({ ...cur, ...patch }))
  const setLangField = (key, value) => setForm((cur) => ({ ...cur, [key]: { ...cur[key], [cur.lang]: value } }))
  // the article has one language: switching it moves the text already typed to the new language key
  const changeLang = (next) => setForm((cur) => {
    const moved = Object.fromEntries(TEXT_KEYS.map((k) => [k, cur[k]?.[cur.lang] ? { [next]: cur[k][cur.lang] } : {}]))
    return { ...cur, ...moved, lang: next }
  })
  function setTitle(value) {
    setLangField('title', value)
    if (!slugTouched && !form.id) set({ slug: slugify(value) })
  }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const stored = toStoredBlocks(blocks)
      // product blocks need the product in the article's product list (the storefront looks them up there)
      const productIds = [...new Set([...(form.product_ids || []), ...productIdsInBlocks(stored)])]
      const payload = { ...form, body: { [form.lang]: stored }, product_ids: productIds, read_minutes: form.read_minutes === '' ? null : form.read_minutes }
      const res = form.id ? await updateContent(form.id, payload) : await createContent(payload)
      setMsg({ ok: true, text: c('saved') })
      load()
      if (!form.id) open(res.id)
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') })
    } finally { setSaving(false) }
  }
  async function remove() {
    if (!form.id || !window.confirm(t('page_website.common.delete_confirm'))) return
    await deleteContent(form.id)
    setForm(null); load()
  }
  async function upload(e) {
    const f = e.target.files[0]
    if (!f) return
    set({ cover_url: await uploadImageFile(f) })
    e.target.value = ''
  }

  const shown = langFilter ? items.filter((x) => x.lang === langFilter) : items
  if (!form) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><h1 className="text-lg font-bold text-gray-800">{c('title')}</h1><p className="text-sm text-gray-500">{c('intro')}</p></div>
          <button type="button" onClick={() => open(null)} className={btnCls}>{c('new')}</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">{c('lang')}:</span>
          {['', ...LANGS].map((l) => (
            <button key={l || 'all'} type="button" onClick={() => setLangFilter(l)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${langFilter === l ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>{l ? t(`page_website.common.language_${l}`) : c('all_langs')}</button>
          ))}
        </div>
        <div className={`${cardCls} overflow-x-auto`}>
          {shown.length === 0 ? <p className="text-sm text-gray-500">{c('empty')}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{t('page_website.common.title')}</th><th>{c('type')}</th><th>{c('lang')}</th><th>{c('slug')}</th><th>{t('page_website.common.status')}</th></tr></thead>
              <tbody className="divide-y">
                {shown.map((x) => (
                  <tr key={x.id} className="cursor-pointer hover:bg-gray-50" onClick={() => open(x.id)}>
                    <td className="py-2 font-medium">{x.title}</td><td>{c(`t_${x.type}`)}</td><td><span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-50 text-sky-700 uppercase">{x.lang}</span></td><td className="text-gray-500">{x.slug}</td>
                    <td><span className={`text-xs px-2 py-0.5 rounded ${x.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{x.is_published ? c('live') : c('draft')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  const seoLen = (form.seo_title?.[lang] || '').length
  // the preview shows what would be saved (empty blocks dropped), with stable keys
  const previewBlocks = previewOpen && blocks ? toStoredBlocks(blocks).map((b, i) => ({ ...b, id: `pv${i}` })) : []
  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl space-y-4">
      <button type="button" onClick={() => setForm(null)} className={btnGhost}>← {t('page_website.common.back_list')}</button>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <div className={`${cardCls} space-y-4`}>
        <div className="grid sm:grid-cols-2 gap-4">
          <L label={c('type')}>
            <select value={form.type} onChange={(e) => set({ type: e.target.value })} className={inputCls}>
              <option value="topic">{c('t_topic')}</option><option value="article">{c('t_article')}</option><option value="host_article">{c('t_host_article')}</option>
            </select>
          </L>
          <L label={c('lang')} hint={c('lang_hint')}>
            <select value={lang} onChange={(e) => changeLang(e.target.value)} className={inputCls}>
              {LANGS.map((l) => <option key={l} value={l}>{t(`page_website.common.language_${l}`)}</option>)}
            </select>
          </L>
        </div>
        <L label={c('slug')} hint={c('slug_hint')}>
          <input value={form.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }) }} className={inputCls} />
          <p className="text-xs text-gray-500 mt-1">{c('url_preview')}: <span className="font-mono">{form.type === 'host_article' ? `/${lang}/hosts/<host>/journal/${form.slug || '…'}` : `/${lang}/style/${form.slug || '…'}`}</span></p>
        </L>
        <L label={c('title_one')}><input value={form.title?.[lang] || ''} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></L>
        <L label={c('summary_one')}><textarea rows={2} value={form.summary?.[lang] || ''} onChange={(e) => setLangField('summary', e.target.value)} className={inputCls} /></L>
        <L label={c('label')}><input value={form.category_label?.[lang] || ''} onChange={(e) => setLangField('category_label', e.target.value)} className={inputCls} /></L>
        <L label={c('body_one')} hint={c('body_hint')}>
          {blocks && <ArticleBlockEditor blocks={blocks} onChange={setBlocks} />}
        </L>
      </div>

      <div className={`${cardCls} space-y-4`}>
        <L label={c('cover')}>
          <div className="flex items-center gap-3">
            {form.cover_url ? <img src={form.cover_url} alt="" className="w-20 h-14 object-cover rounded-lg bg-gray-100" /> : <div className="w-20 h-14 rounded-lg bg-gray-100" />}
            <input type="file" accept="image/*" onChange={upload} className="text-xs" />
            <input value={form.cover_url || ''} onChange={(e) => set({ cover_url: e.target.value })} className={inputCls} placeholder="https://..." />
          </div>
        </L>
        <L label={c('cover_alt')}><input value={form.cover_alt?.[lang] || ''} onChange={(e) => setLangField('cover_alt', e.target.value)} className={inputCls} /></L>
        <div className="grid sm:grid-cols-3 gap-4">
          <L label={c('author_host')}>
            <select value={form.author_host_id || ''} onChange={(e) => set({ author_host_id: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
              <option value="">{t('page_website.common.none')}</option>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </L>
          <L label={c('author_name')}><input value={form.author_name || ''} onChange={(e) => set({ author_name: e.target.value })} className={inputCls} /></L>
          <L label={c('read_min')}><input type="number" value={form.read_minutes ?? ''} onChange={(e) => set({ read_minutes: e.target.value === '' ? null : Number(e.target.value) })} className={inputCls} /></L>
        </div>
        <L label={c('tags')}><input value={(form.tags || []).join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={inputCls} /></L>
      </div>

      <div className={`${cardCls} space-y-4`}>
        <h2 className="font-bold text-gray-800">{c('relations')}</h2>
        <L label={c('products')}>
          <ul className="space-y-1 mb-2">
            {form.product_ids.map((id) => <li key={id} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{products.find((p) => p.id === id)?.name || `#${id}`}</span><button type="button" onClick={() => set({ product_ids: form.product_ids.filter((x) => x !== id) })} className={btnGhost}>×</button></li>)}
          </ul>
          <ProductSearch placeholder={c('add_product')} onPick={(p) => !form.product_ids.includes(p.id) && set({ product_ids: [...form.product_ids, p.id] })} />
        </L>
        <L label={c('categories')}>
          <div className="flex flex-wrap gap-3">{cats.map((cat) => <label key={cat.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.category_ids.includes(cat.id)} onChange={(e) => set({ category_ids: e.target.checked ? [...form.category_ids, cat.id] : form.category_ids.filter((x) => x !== cat.id) })} />{cat.name_id || cat.name}</label>)}</div>
        </L>
        <L label={c('hosts')}>
          <div className="flex flex-wrap gap-3">{hosts.map((h) => <label key={h.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.host_ids.includes(h.id)} onChange={(e) => set({ host_ids: e.target.checked ? [...form.host_ids, h.id] : form.host_ids.filter((x) => x !== h.id) })} />{h.name}</label>)}</div>
        </L>
      </div>

      <div className={`${cardCls} space-y-4`}>
        <h2 className="font-bold text-gray-800">{c('seo')}</h2>
        <L label={c('seo_title')} hint={c('seo_len', { n: seoLen })}><input value={form.seo_title?.[lang] || ''} onChange={(e) => setLangField('seo_title', e.target.value)} className={inputCls} /></L>
        <L label={c('seo_desc')} hint={c('seo_len', { n: (form.seo_description?.[lang] || '').length })}><textarea rows={2} value={form.seo_description?.[lang] || ''} onChange={(e) => setLangField('seo_description', e.target.value)} className={inputCls} /></L>
        <L label={c('canonical')}><input value={form.canonical_url || ''} onChange={(e) => set({ canonical_url: e.target.value })} className={inputCls} /></L>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_indexed} onChange={(e) => set({ is_indexed: e.target.checked })} />{c('indexed')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => set({ is_featured: e.target.checked })} />{c('featured')}</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.is_published} onChange={(e) => set({ is_published: e.target.checked })} />{c('published')}</label>
        </div>
      </div>

      <div className="sticky bottom-0 bg-gray-50/90 py-3 flex gap-3 items-center">
        <button type="button" onClick={save} disabled={saving} className={btnCls}>{saving ? t('page_website.common.saving') : t('page_website.common.save')}</button>
        <button type="button" onClick={() => setPreviewOpen(true)} className={btnGhost}>{c('preview.button')}</button>
        {form.id && <button type="button" onClick={remove} className="text-sm text-red-600 underline">{c('delete')}</button>}
      </div>
      {previewOpen && (
        <ArticlePreview
          title={form.title?.[lang]} summary={form.summary?.[lang]} categoryLabel={form.category_label?.[lang]} coverUrl={form.cover_url}
          author={form.author_name || hosts.find((h) => h.id === form.author_host_id)?.name || ''} readMinutes={form.read_minutes}
          tags={form.tags} type={form.type} blocks={previewBlocks}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

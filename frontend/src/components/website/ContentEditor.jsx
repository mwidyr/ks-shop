import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories } from '../../api/categories'
import { listHosts } from '../../api/hosts'
import {
  checkContentSlug, createContent, createContentTemplate, deleteContent, discardContentDraft, getContent, getContentTemplate, listContentTemplates, listContentTypes, updateContent,
} from '../../api/website'
import { uploadImageFile, resolveUrl } from '../../utils/image'
import { toEditorBlocks, toStoredBlocks, tocFromBlocks, showToc } from '../../utils/articleBlocks'
import { modernizeBlocks } from '../../utils/richText'
import { EMPTY_FORM, LANGS, TEXT_KEYS, buildPayload, loadForm, publishProblems, slugify, snapshotOf, typeLabel } from '../../utils/contentForm'
import ArticleBlockEditor from './ArticleBlockEditor'
import ArticlePreview from './ArticlePreview'
import ContentTypeManager from './ContentTypeManager'
import RichTextEditor from './RichTextEditor'
import TagInput from './TagInput'
import TemplateManager from './TemplateManager'
import { btnCls, btnGhost, cardCls, inputCls, ProductSearch, useProductList } from './Pickers'

export const AUTOSAVE_MS = 3000

function Section({ n, title, badge, children }) {
  return (
    <section className={`${cardCls} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-800">{n ? `${n}. ` : ''}{title}</h2>
        {badge && <span className="text-xs rounded-full border border-gray-300 px-2 py-0.5 text-gray-500">{badge}</span>}
      </div>
      {children}
    </section>
  )
}
const Field = ({ label, hint, children }) => <div><label className="text-sm font-medium text-gray-700">{label}</label>{children}{hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}</div>

// The article editor. Layout (top to bottom): sticky action bar, 1 Title (H1), 2 Featured image / banner, 3 Introduction,
// 4 Table of contents (automatic), 5 Content blocks (+ templates), then the Article Settings. Nothing about fonts, sizes or
// SEO is set here: the website controls the styling and the SEO tags are generated from the title and the introduction.
export default function ContentEditor({ id: initialId, onBack, onSaved }) {
  const { t, i18n } = useTranslation()
  const c = (k, o) => t(`page_website.content.${k}`, o)
  const e = (k, o) => t(`page_website.content.ed.${k}`, o)
  const products = useProductList()
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [blocks, setBlocks] = useState([])
  const [intro, setIntro] = useState({ text: '', html: '' })
  const [introKey, setIntroKey] = useState(0) // remounts the introduction editor when its content is replaced (draft restored)
  const [live, setLive] = useState(false) // the article is published (Update, and edits go to a separate draft)
  const [savedSnap, setSavedSnap] = useState('')
  const [everSaved, setEverSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [msg, setMsg] = useState(null)
  const [draftBanner, setDraftBanner] = useState(null) // { at, dto }
  const [slugTouched, setSlugTouched] = useState(Boolean(initialId))
  const [slugState, setSlugState] = useState('') // '' | ok | taken | invalid
  const [cats, setCats] = useState([])
  const [hosts, setHosts] = useState([])
  const [types, setTypes] = useState([])
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const savingRef = useRef(false)
  const lang = form.lang

  const reloadTypes = () => listContentTypes().then(setTypes).catch(() => {})
  const reloadTemplates = () => listContentTemplates().then(setTemplates).catch(() => {})
  useEffect(() => { listCategories().then(setCats).catch(() => {}); listHosts().then(setHosts).catch(() => {}); reloadTypes(); reloadTemplates() }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!initialId) {
        const f = { ...EMPTY_FORM }
        setForm(f); setBlocks([]); setIntro({ text: '', html: '' }); setSavedSnap(snapshotOf(f, [], { text: '', html: '' })); setLive(false); setLoaded(true)
        return
      }
      const dto = await getContent(initialId)
      if (cancelled) return
      const { form: f, blocks: b } = loadForm(dto)
      const i = { text: f.summary?.[f.lang] || '', html: f.intro_html?.[f.lang] || '' }
      setForm(f); setBlocks(b); setIntro(i); setIntroKey((k) => k + 1); setLive(Boolean(dto.is_published)); setSavedSnap(snapshotOf(f, b, i)); setEverSaved(true)
      if (dto.draft) setDraftBanner({ at: dto.draft_saved_at, dto: dto.draft })
      setLoaded(true)
    }
    init().catch(() => { if (!cancelled) setMsg({ ok: false, text: t('page_website.common.error') }) })
    return () => { cancelled = true }
  }, [initialId]) // eslint-disable-line react-hooks/exhaustive-deps

  const snap = useMemo(() => (loaded ? snapshotOf(form, blocks, intro) : ''), [loaded, form, blocks, intro])
  const dirty = loaded && snap !== savedSnap
  const set = (patch) => setForm((cur) => ({ ...cur, ...patch }))
  const setLangField = (key, value) => setForm((cur) => ({ ...cur, [key]: { ...cur[key], [cur.lang]: value } }))
  const changeLang = (next) => setForm((cur) => {
    const moved = Object.fromEntries(TEXT_KEYS.map((k) => [k, cur[k]?.[cur.lang] ? { [next]: cur[k][cur.lang] } : {}]))
    return { ...cur, ...moved, lang: next }
  })
  function setTitle(value) {
    setLangField('title', value)
    if (!slugTouched && !form.id) set({ slug: slugify(value) })
  }

  // ---- saving ------------------------------------------------------------------------------------------
  // kind: 'auto' (autosave) | 'draft' (Save Draft) | 'publish' (Publish / Update)
  async function persist(kind) {
    if (savingRef.current) return false
    const problems = kind === 'publish' ? publishProblems(form) : publishProblems(form).filter((p) => p !== 'host')
    if (problems.length) {
      if (kind !== 'auto') setMsg({ ok: false, text: problems.map((p) => e(`err_${p}`)).join(' · ') })
      return false
    }
    savingRef.current = true
    setSaving(true); setSaveError('')
    const taken = snap
    try {
      const payload = buildPayload(form, blocks, intro)
      let res
      if (kind === 'publish') {
        payload.is_published = true
        res = form.id ? await updateContent(form.id, payload) : await createContent(payload)
        setLive(true); setDraftBanner(null)
      } else {
        payload.is_published = live
        res = form.id ? await updateContent(form.id, payload, 'draft') : await createContent({ ...payload, is_published: false }, 'draft')
      }
      if (!form.id) setForm((cur) => ({ ...cur, id: res.id }))
      setSavedSnap(taken); setEverSaved(true)
      if (kind === 'publish') setMsg({ ok: true, text: live ? e('updated') : e('published') })
      else if (kind === 'draft') setMsg({ ok: true, text: e('draft_saved') })
      onSaved?.()
      return true
    } catch (ex) {
      const text = ex.response?.data?.error || t('page_website.common.error')
      setSaveError(text)
      if (kind !== 'auto') setMsg({ ok: false, text })
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Autosave: a few seconds after the last change (never while a draft restore is still undecided).
  useEffect(() => {
    if (!loaded || !dirty || saving || draftBanner || saveError) return undefined
    const id = setTimeout(() => { persist('auto') }, AUTOSAVE_MS)
    return () => clearTimeout(id)
  }, [snap, loaded, dirty, saving, draftBanner, saveError]) // eslint-disable-line react-hooks/exhaustive-deps

  // A failed autosave is retried as soon as the staff change something again.
  useEffect(() => { setSaveError('') }, [snap])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (ev) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const status = saving ? 'saving' : (dirty || saveError) ? 'unsaved' : everSaved ? 'saved' : ''
  function back() {
    if (dirty && !window.confirm(e('leave_confirm'))) return
    onBack()
  }

  function continueDraft() {
    const { form: f, blocks: b } = loadForm({ ...draftBanner.dto, id: form.id })
    const i = { text: f.summary?.[f.lang] || '', html: f.intro_html?.[f.lang] || '' }
    setForm({ ...f, id: form.id }); setBlocks(b); setIntro(i); setIntroKey((k) => k + 1)
    setSavedSnap(snapshotOf(f, b, i)); setDraftBanner(null)
  }
  async function discardDraft() {
    if (!window.confirm(e('discard_confirm'))) return
    await discardContentDraft(form.id)
    setDraftBanner(null)
  }
  async function unpublish() {
    if (!window.confirm(e('unpublish_confirm'))) return
    try {
      await updateContent(form.id, { ...buildPayload(form, blocks, intro), is_published: false })
      setLive(false); setSavedSnap(snap); setMsg({ ok: true, text: e('unpublished') }); onSaved?.()
    } catch (ex) { setMsg({ ok: false, text: ex.response?.data?.error || t('page_website.common.error') }) }
  }
  async function remove() {
    if (!form.id || !window.confirm(t('page_website.common.delete_confirm'))) return
    await deleteContent(form.id)
    onSaved?.(); onBack()
  }
  async function upload(ev) {
    const f = ev.target.files[0]
    ev.target.value = ''
    if (f) set({ cover_url: await uploadImageFile(f) })
  }
  async function checkSlug() {
    if (!form.slug) { setSlugState(''); return }
    try {
      const r = await checkContentSlug(form.slug, form.id)
      setSlugState(!r.valid ? 'invalid' : r.available ? 'ok' : 'taken')
    } catch { setSlugState('') }
  }

  // ---- templates ---------------------------------------------------------------------------------------
  async function saveTemplate() {
    const stored = toStoredBlocks(blocks)
    if (!stored.length) { window.alert(e('template_empty')); return }
    const name = window.prompt(e('template_name_prompt'), form.title?.[lang] || '')
    if (!name || !name.trim()) return
    try { await createContentTemplate(name.trim(), stored); await reloadTemplates(); setMsg({ ok: true, text: e('template_saved') }) } catch (ex) { setMsg({ ok: false, text: ex.response?.data?.error || t('page_website.common.error') }) }
  }
  async function applyTemplate() {
    if (!templateId) return
    const tpl = await getContentTemplate(templateId)
    const copy = modernizeBlocks(toEditorBlocks(tpl.blocks || [])).blocks // new ids: the article gets its own copy
    if (blocks.length && !window.confirm(e('template_replace_confirm'))) setBlocks([...blocks, ...copy])
    else setBlocks(copy)
  }

  const toc = tocFromBlocks(blocks)
  const previewBlocks = previewOpen ? toStoredBlocks(blocks).map((b, i) => ({ ...b, id: `pv${i}` })) : []
  const authorName = form.author_name || hosts.find((h) => h.id === form.author_host_id)?.name || ''
  if (!loaded) return <div className="px-4 sm:px-6 py-10 text-sm text-gray-500">{t('page_website.common.loading') || '…'}</div>

  const statusText = { saving: e('status_saving'), saved: e('status_saved'), unsaved: e('status_unsaved') }[status]
  return (
    <div className="max-w-4xl">
      {/* sticky action bar: stays visible while scrolling a long article */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={back} className={btnGhost} aria-label={t('page_website.common.back_list')}>←</button>
          <div className="min-w-0">
            <p className="font-bold text-gray-800 leading-tight">{e('page_title')}</p>
            <p className={`text-xs ${status === 'unsaved' ? 'text-amber-600' : 'text-gray-500'}`} role="status" aria-live="polite">{statusText || ' '}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPreviewOpen(true)} className={btnGhost}>{e('preview')}</button>
          <button type="button" onClick={() => persist('draft')} disabled={saving} className={btnGhost}>{e('save_draft')}</button>
          <button type="button" onClick={() => persist('publish')} disabled={saving} className={btnCls}>{live ? e('update') : e('publish')}</button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`} role="alert">{msg.text}</div>}
        {draftBanner && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center justify-between gap-3 flex-wrap">
            <span>{e('draft_banner', { time: draftBanner.at ? new Date(draftBanner.at).toLocaleString() : '' })}</span>
            <span className="flex gap-2"><button type="button" onClick={continueDraft} className={btnCls}>{e('draft_continue')}</button><button type="button" onClick={discardDraft} className={btnGhost}>{e('draft_discard')}</button></span>
          </div>
        )}

        <Section n={1} title={<>{e('s_title')} <span className="text-xs font-normal text-gray-400">(H1)</span></>} badge={e('required')}>
          <input value={form.title?.[lang] || ''} onChange={(ev) => setTitle(ev.target.value)} className={inputCls} aria-label={e('s_title')} />
        </Section>

        <Section n={2} title={e('s_cover')} badge={e('cover_badge')}>
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center min-h-[140px] overflow-hidden">
            {form.cover_url ? <img src={resolveUrl(form.cover_url)} alt="" className="max-h-64 w-full object-cover" /> : <span className="text-sm text-gray-500 py-10">{e('cover_empty')}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`${btnCls} cursor-pointer`}>{e('upload_image')}<input type="file" accept="image/*" onChange={upload} className="hidden" /></label>
            <button type="button" onClick={() => set({ cover_url: '' })} disabled={!form.cover_url} className={`${btnGhost} disabled:opacity-40`}>{e('remove')}</button>
          </div>
          <Field label={c('cover_alt')} hint={e('cover_hint')}><input value={form.cover_alt?.[lang] || ''} onChange={(ev) => setLangField('cover_alt', ev.target.value)} className={inputCls} /></Field>
        </Section>

        <Section n={3} title={e('s_intro')} badge={e('optional')}>
          <RichTextEditor key={`intro-${introKey}`} mode="text" value={{ text: intro.text, html: intro.html }} onChange={setIntro} />
        </Section>

        <Section n={4} title={e('s_toc')} badge={e('auto_generated')}>
          {toc.length ? <ol className="list-decimal list-inside text-sm text-brand-600 space-y-0.5 rounded-lg border border-gray-200 px-3 py-2">{toc.map((x) => <li key={x.i}>{x.text}</li>)}</ol>
            : <p className="text-sm text-gray-500 rounded-lg border border-gray-200 px-3 py-2">{e('toc_empty')}</p>}
          <p className="text-xs text-gray-500">{e('toc_hint')}{!showToc(toc) && toc.length > 0 ? ` ${e('toc_needs_two')}` : ''}</p>
        </Section>

        <Section n={5} title={e('s_blocks')}>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={saveTemplate} className={btnGhost}>{e('save_template')}</button>
            <select value={templateId} onChange={(ev) => setTemplateId(ev.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-transparent min-w-[200px]" aria-label={e('template_choose')}>
              <option value="">{e('template_choose')}</option>
              {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </select>
            <button type="button" onClick={applyTemplate} disabled={!templateId} className={`${btnGhost} disabled:opacity-40`}>{e('template_apply')}</button>
            <button type="button" onClick={() => setShowTemplates(true)} className="text-xs text-gray-500 underline">{e('manage_templates')}</button>
          </div>
          <ArticleBlockEditor blocks={blocks} onChange={setBlocks} hideToc />
        </Section>

        <Section title={e('s_settings')}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={c('type')}>
              <div className="flex gap-2">
                <select value={form.type} onChange={(ev) => set({ type: ev.target.value })} className={inputCls}>
                  {types.map((tp) => <option key={tp.slug} value={tp.slug}>{typeLabel(tp, i18n.language)}</option>)}
                  {!types.some((tp) => tp.slug === form.type) && <option value={form.type}>{form.type}</option>}
                </select>
                <button type="button" onClick={() => setShowTypes(true)} className={`${btnGhost} whitespace-nowrap`}>{e('manage_types')}</button>
              </div>
            </Field>
            <Field label={c('lang')} hint={c('lang_hint')}>
              <select value={lang} onChange={(ev) => changeLang(ev.target.value)} className={inputCls}>
                {LANGS.map((l) => <option key={l} value={l}>{t(`page_website.common.language_${l}`)}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.is_featured} onChange={(ev) => set({ is_featured: ev.target.checked })} /><span><b>{e('featured')}</b><br /><span className="text-xs text-gray-500">{e('featured_hint')}</span></span></label>
          <Field label={c('slug')} hint={c('slug_hint')}>
            <input value={form.slug} onChange={(ev) => { setSlugTouched(true); setSlugState(''); set({ slug: ev.target.value.toLowerCase() }) }} onBlur={checkSlug} className={inputCls} />
            <p className="text-xs mt-1 text-gray-500">{c('url_preview')}: <span className="font-mono">{form.type === 'host_article' ? `/${lang}/hosts/<host>/journal/${form.slug || '…'}` : `/${lang}/style/${form.slug || '…'}`}</span>
              {slugState && <span className={`ml-2 font-semibold ${slugState === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{e(`slug_${slugState}`)}</span>}</p>
          </Field>
          <Field label={c('label')}><input value={form.category_label?.[lang] || ''} onChange={(ev) => setLangField('category_label', ev.target.value)} className={inputCls} /></Field>
          <Field label={c('categories')}>
            <div className="flex flex-wrap gap-3">{cats.map((cat) => <label key={cat.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.category_ids.includes(cat.id)} onChange={(ev) => set({ category_ids: ev.target.checked ? [...form.category_ids, cat.id] : form.category_ids.filter((x) => x !== cat.id) })} />{cat.name_id || cat.name}</label>)}</div>
          </Field>
          <Field label={e('field_tags')}><TagInput value={form.tags || []} onChange={(tags) => set({ tags })} placeholder={e('tags_placeholder')} hint={e('tags_hint')} /></Field>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label={c('author_host')}>
              <select value={form.author_host_id || ''} onChange={(ev) => set({ author_host_id: ev.target.value ? Number(ev.target.value) : null })} className={inputCls}>
                <option value="">{t('page_website.common.none')}</option>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Field>
            <Field label={c('author_name')}><input value={form.author_name || ''} onChange={(ev) => set({ author_name: ev.target.value })} className={inputCls} /></Field>
            <Field label={c('read_min')}><input type="number" value={form.read_minutes ?? ''} onChange={(ev) => set({ read_minutes: ev.target.value === '' ? null : Number(ev.target.value) })} className={inputCls} /></Field>
          </div>
          <Field label={c('products')}>
            <ul className="space-y-1 mb-2">{form.product_ids.map((pid) => <li key={pid} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{products.find((p) => p.id === pid)?.name || `#${pid}`}</span><button type="button" onClick={() => set({ product_ids: form.product_ids.filter((x) => x !== pid) })} className={btnGhost}>×</button></li>)}</ul>
            <ProductSearch placeholder={c('add_product')} onPick={(p) => !form.product_ids.includes(p.id) && set({ product_ids: [...form.product_ids, p.id] })} />
          </Field>
          <Field label={c('hosts')}>
            <div className="flex flex-wrap gap-3">{hosts.map((h) => <label key={h.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.host_ids.includes(h.id)} onChange={(ev) => set({ host_ids: ev.target.checked ? [...form.host_ids, h.id] : form.host_ids.filter((x) => x !== h.id) })} />{h.name}</label>)}</div>
          </Field>
          <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
            {live && form.id && <button type="button" onClick={unpublish} className="text-sm text-amber-700 underline">{e('unpublish')}</button>}
            {form.id && <button type="button" onClick={remove} className="text-sm text-red-600 underline">{c('delete')}</button>}
          </div>
        </Section>
      </div>

      {previewOpen && (
        <ArticlePreview
          title={form.title?.[lang]} summary={intro.text} introHtml={intro.html} coverAlt={form.cover_alt?.[lang]} categoryLabel={form.category_label?.[lang]} coverUrl={form.cover_url}
          author={authorName} readMinutes={form.read_minutes} tags={form.tags} type={form.type} blocks={previewBlocks} onClose={() => setPreviewOpen(false)}
        />
      )}
      {showTypes && <ContentTypeManager onClose={() => setShowTypes(false)} onChanged={reloadTypes} />}
      {showTemplates && <TemplateManager onClose={() => setShowTemplates(false)} onChanged={reloadTemplates} />}
    </div>
  )
}

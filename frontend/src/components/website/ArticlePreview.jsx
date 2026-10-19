import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveUrl } from '../../utils/image'
import { safeInlineHtml, showToc, tocFromBlocks } from '../../utils/articleBlocks'
import { useProductList } from './Pickers'

// What the article looks like on the website, rendered from the SAME blocks that will be saved (also
// unsaved ones). This mirrors the body rendering of storefront/src/pages/Content.jsx (block order,
// heading/list/image/product styles, the table of contents above the first paragraph when there are
// two or more H2 headings) in a phone-width frame. If that page's block markup changes, change it here too.
const T = { text: '#2B2B2E', text2: '#5F6168', soft: '#F7F7F8', border: '#E5E5E8', strong: '#B8432D', live: '#E5484D' }
const tagPill = { height: 30, padding: '0 12px', borderRadius: 15, background: T.soft, color: T.text, fontSize: 12, display: 'flex', alignItems: 'center' }

export default function ArticlePreview({ title, summary, introHtml, coverAlt, coverUrl, categoryLabel, author, readMinutes, tags, type, blocks, onClose }) {
  const { t } = useTranslation()
  const products = useProductList()
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const toc = tocFromBlocks(blocks)
  const topic = type === 'topic'
  let tocDone = false
  let h2Seen = 0
  const heading = (b) => (b.html ? <span dangerouslySetInnerHTML={{ __html: safeInlineHtml(b.html) }} /> : b.text)
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const rendered = blocks.map((b, i) => {
    const out = []
    if (b.type === 'h2') {
      if (h2Seen > 0) out.push(<hr key={`hr${b.id}`} style={{ width: '100%', border: 0, borderTop: `1px solid ${T.border}`, margin: '12px 0 4px' }} />) // automatic divider above every H2 but the first
      h2Seen += 1
      out.push(<h2 key={b.id} id={`pv-s${i}`} style={{ margin: topic ? 0 : '8px 0 0', fontSize: 20, fontWeight: 700 }}>{heading(b)}</h2>)
    } else if (b.type === 'h3') out.push(<h3 key={b.id} style={{ margin: '8px 0 0', fontSize: 17 }}>{heading(b)}</h3>)
    else if (b.type === 'list' || b.type === 'olist') {
      const Tag = b.type === 'olist' ? 'ol' : 'ul'
      out.push(<Tag key={b.id} style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{(b.items || []).map((x, n) => (b.items_html?.[n]
        ? <li key={n} dangerouslySetInnerHTML={{ __html: safeInlineHtml(b.items_html[n]) }} />
        : <li key={n}>{x}</li>))}</Tag>)
    } else if (b.type === 'image') {
      if (b.url) out.push(
        <figure key={b.id} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img src={resolveUrl(b.url)} alt={b.alt || ''} style={{ width: '100%', height: 320, borderRadius: 16, objectFit: 'cover', objectPosition: 'center 25%' }} />
          {(b.caption || b.alt) && <figcaption style={{ fontSize: 13, color: T.text2 }}>{b.caption || b.alt}</figcaption>}
        </figure>)
    } else if (b.type === 'product') {
      const p = byId[b.product_id]
      if (p) {
        const price = Math.min(...(p.variants || []).filter((v) => v.is_active !== false).map((v) => Number(v.price) || 0))
        out.push(
          <div key={b.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, background: '#fff', border: `1px solid ${T.border}` }}>
            {p.images?.[0]?.url ? <img src={resolveUrl(p.images[0].url)} alt={p.name} style={{ width: 64, height: 84, borderRadius: 10, objectFit: 'cover' }} /> : <div style={{ width: 64, height: 84, borderRadius: 10, background: T.soft }} />}
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, color: T.live, fontWeight: 700 }}>{t('page_website.content.preview.shop_note')}</span>
              <b style={{ fontSize: 15 }}>{p.name}</b>
              {Number.isFinite(price) && <span style={{ fontSize: 15, fontWeight: 700 }}>NT${Math.round(price).toLocaleString('en-US')}</span>}
            </span>
            <span style={{ flex: 'none', height: 36, padding: '0 14px', fontWeight: 700, borderRadius: 18, background: T.text, color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center' }}>{t('page_website.content.preview.view_product')}</span>
          </div>)
      }
    } else if (b.type === 'tags') {
      if ((b.items || []).length) out.push(<div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{b.items.map((x) => <span key={x} style={tagPill}>#{x}</span>)}</div>)
    } else if (b.html && /<(p|ul|ol)\b/i.test(b.html)) {
      out.push(<div key={b.id} className="preview-rich" style={{ fontSize: 15, lineHeight: 1.85, color: T.text }} dangerouslySetInnerHTML={{ __html: safeInlineHtml(b.html) }} />)
    } else if (b.html) {
      out.push(<p key={b.id} style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: T.text, whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: safeInlineHtml(b.html) }} />)
    } else if ((b.text || '').trim()) {
      out.push(<p key={b.id} style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: T.text, whiteSpace: 'pre-line' }}>{b.text}</p>)
    }
    if (!tocDone && !topic && showToc(toc) && b.type === 'p' && (b.text || '').trim()) {
      tocDone = true
      out.push(
        <div key="toc" style={{ padding: '14px 16px', borderRadius: 14, background: T.soft, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
          <b>{t('page_website.content.preview.toc')}</b>
          {toc.map((x, n) => <a key={x.i} href={`#pv-s${x.i}`} style={{ color: T.strong }}>{n + 1}. {x.text.replace(/^\d+\.\s*/, '')}</a>)}
        </div>)
    }
    return out
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-3xl bg-white shadow-xl my-4 overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('page_website.content.preview.title')}</span>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">{t('page_website.content.preview.close')}</button>
        </div>
        <style>{`.preview-rich > * { margin: 0 0 10px } .preview-rich > *:last-child { margin-bottom: 0 } .preview-rich ul { list-style: disc; padding-left: 20px } .preview-rich ol { list-style: decimal; padding-left: 20px } .preview-rich li > p { margin: 0 } .preview-rich a { color: #B8432D; text-decoration: underline }`}</style>
        <article style={{ color: T.text, fontFamily: 'Inter, "Noto Sans TC", sans-serif' }}>
          <header style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: topic ? T.strong : '#C2563B' }}>{categoryLabel}</span>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.35 }}>{title || t('page_website.content.preview.untitled')}</h1>
            <span style={{ fontSize: 12, color: T.text2 }}>{author}{author && readMinutes ? '・' : ''}{readMinutes ? t('page_website.content.preview.read_min', { n: readMinutes }) : ''}</span>
          </header>
          {coverUrl && <img src={resolveUrl(coverUrl)} alt={coverAlt || ''} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />}
          <div style={{ padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {introHtml
              ? <div className="preview-rich" style={{ fontSize: 15, lineHeight: 1.85, color: T.text }} dangerouslySetInnerHTML={{ __html: safeInlineHtml(introHtml) }} />
              : summary && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, whiteSpace: 'pre-line' }}>{summary}</p>}
            {rendered}
            {!topic && tags?.length > 0 && !blocks.some((b) => b.type === 'tags') && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{tags.map((x) => <span key={x} style={tagPill}>#{x}</span>)}</div>}
          </div>
        </article>
      </div>
    </div>
  )
}

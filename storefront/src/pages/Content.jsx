import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CONTENT_LANGS, contentHref, getContent, img, onImgError, sized } from '../lib/api'
import { safeHtml } from '../lib/safeHtml'
import { fullDate } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useArticleFavs } from '../lib/articleFavs'
import { HostCard } from '../components/HostCard'
import { IconHeart, IconMenu, IconSearch, IconShare } from '../components/Icons'
import { ProductCard, StripCard } from '../components/ProductCard'
import { EmptyState, ErrorState, iconBtn, PageHeader, SectionHead, Skeleton, btnPrimary } from '../components/ui'

// Topic / article / host-journal page (artboards Topic / Article). Body = blocks {type: h2|h3|p|list|image|product|products|tags}.
function Blocks({ blocks, products, topic, hostName }) {
  const { t } = useTranslation()
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  let h2Seen = 0
  // headings may carry bold / italic / underline / links (b.html, inline only); plain text otherwise
  const heading = (b) => (b.html ? <span dangerouslySetInnerHTML={{ __html: safeHtml(b.html) }} /> : b.text)
  return (
    <>
      {blocks.map((b, i) => {
        const out = []
        if (b.type === 'h2') {
          // a divider above every H2 section except the first (automatic, no divider block)
          if (h2Seen > 0) out.push(<hr key={`hr${i}`} className="article-divider" />)
          h2Seen += 1
          out.push(<h2 key={i} id={`s${i}`} style={{ margin: topic || hostName ? 0 : '8px 0 0', fontSize: 20, fontWeight: 700, lineHeight: hostName ? 1.85 : undefined }}>{heading(b)}</h2>)
        } else if (b.type === 'h3') out.push(<h3 key={i} style={{ margin: '8px 0 0', fontSize: 17 }}>{heading(b)}</h3>)
        else if (b.type === 'list' || b.type === 'olist') {
          const Tag = b.type === 'olist' ? 'ol' : 'ul'
          out.push(<Tag key={i} style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{(b.items || []).map((x, n) => (b.items_html?.[n]
            ? <li key={n} dangerouslySetInnerHTML={{ __html: safeHtml(b.items_html[n]) }} />
            : <li key={n}>{x}</li>))}</Tag>)
        }
        else if (b.type === 'image') out.push(
          <figure key={i} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <img src={sized(img(b.url), 900)} alt={b.alt || ''} loading="lazy" onError={onImgError} style={{ width: '100%', height: 320, borderRadius: 16, objectFit: 'cover', objectPosition: 'center 25%' }} />
            {(b.caption || b.alt) && <figcaption style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{b.caption || b.alt}</figcaption>}
          </figure>)
        else if (b.type === 'product' && byId[b.product_id]) {
          const p = byId[b.product_id]
          out.push(
            <Link key={i} to={`/p/${p.id}`} style={{ lineHeight: hostName ? 1.85 : undefined, display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
              <img src={sized(img(p.image), 160)} alt={hostName ? '' : p.name} loading="lazy" onError={onImgError} style={hostName ? { width: 60, height: 80, borderRadius: 10, objectFit: 'cover' } : { width: 64, height: 84, borderRadius: 10, objectFit: 'cover' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: hostName ? 0 : 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-live)', fontWeight: 700 }}>{p.wear_size && hostName ? t('style.wears', { name: hostName, size: p.wear_size }) : p.live_code ? t('product.live_code_badge', { code: p.live_code }) : t('style.shop_note')}</span>
                <b style={{ fontSize: 15 }}>{p.name}</b><span style={{ fontSize: 15, fontWeight: 700 }}>NT${Math.round(p.price).toLocaleString('en-US')}</span>
              </span>
              <span style={{ flex: 'none', ...(hostName ? { minHeight: 36, padding: '0 12px' } : { height: 36, padding: '0 14px', fontWeight: 700 }), borderRadius: 18, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 13, display: 'flex', alignItems: 'center' }}>{t('style.view_product')}</span>
            </Link>)
        } else if (b.type === 'tags') out.push(<div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{(b.items || []).map((x) => <span key={x} style={tagPill}>#{x}</span>)}</div>)
        else if (b.html && /<(p|ul|ol)\b/i.test(b.html)) out.push(<div key={i} className="article-rich article-rich-block" style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--color-text)' }} dangerouslySetInnerHTML={{ __html: safeHtml(b.html) }} />)
        else if (b.html) out.push(<p key={i} className="article-rich" style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--color-text)', whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: safeHtml(b.html) }} />)
        else out.push(<p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--color-text)', whiteSpace: 'pre-line' }}>{b.text}</p>)
        return out
      })}
    </>
  )
}
const tagPill = { height: 30, padding: '0 12px', borderRadius: 15, background: 'var(--color-bg-soft)', color: 'var(--color-text)', fontSize: 12, display: 'flex', alignItems: 'center', textDecoration: 'none' }
const tocBox = (toc, t) => (
  <div key="toc" style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
    <b>{t('style.toc')}</b>
    {toc.map((x, n) => <a key={x.i} href={`#s${x.i}`} style={{ color: 'var(--color-primary-strong)' }}>{n + 1}. {x.text.replace(/^\d+\.\s*/, '')}</a>)}
  </div>
)

export default function Content() {
  const params = useParams()
  const slug = params.slug2 || params.slug
  const { pathname } = useLocation()
  const badPrefix = Boolean(params.lang) && !CONTENT_LANGS.includes(params.lang)
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const saved = useArticleFavs()
  const [d, setD] = useState(null)
  const [state, setState] = useState('loading')
  const load = useCallback(() => { if (badPrefix) { setState('notfound'); return }; setState('loading'); getContent(slug).then((x) => { setD(x); setState('ok') }).catch((e) => setState(e.status === 404 ? 'notfound' : 'error')) }, [slug, badPrefix])
  useEffect(() => { load() }, [load, i18n.language])
  const page = d?.page
  const seo = d?.seo
  useSeo({
    title: seo?.title || page?.title, description: seo?.description || page?.summary, canonical: seo?.canonical || (page ? contentHref(page) : ''),
    noindex: seo ? seo.index === false : false,
    jsonLd: page ? { '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.summary, image: page.cover_url, datePublished: page.published_at, author: { '@type': 'Person', name: page.author } } : null,
  })
  // the old unprefixed URL (/style/x) and a wrong language prefix go to the article's own /{lang}/... URL
  if (state === 'ok' && page?.path && page.path !== pathname.replace(/\/+$/, '')) return <Navigate to={page.path} replace />
  if (state === 'loading') return <div><PageHeader title="" /><Skeleton h={220} r={0} /></div>
  if (state === 'notfound') return <div><PageHeader title="" /><EmptyState title={t('style.notfound')} action={<Link to="/style" style={{ ...btnPrimary, marginTop: 8 }}>{t('style.title')}</Link>} /></div>
  if (state === 'error') return <div><PageHeader title="" /><ErrorState title={t('style.error')} onRetry={load} /></div>
  const px = desktop ? 40 : 16
  const topic = page.type === 'topic'
  const hostArt = page.type === 'host_article'
  const customType = !['topic', 'article', 'host_article'].includes(page.type) // a type staff created: its name is shown
  // same rule as the admin preview: at least 2 headings with text; the box always sits right under the introduction
  const toc = d.blocks.map((b, i) => (b.type === 'h2' && String(b.text || '').trim() ? { i, text: String(b.text).trim() } : null)).filter(Boolean)
  const href = contentHref
  const dateDots = (iso) => fullDate(iso).replace(/\//g, '.')
  const isSaved = saved.has(page.slug)
  const right = topic || hostArt
    ? <><Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link><Link to="/menu" aria-label={t('menu.title')} style={iconBtn}><IconMenu /></Link></>
    : <>
        <button type="button" aria-label={t('style.share')} onClick={() => navigator.share?.({ title: page.title, url: window.location.href }).catch(() => {})} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconShare size={20} /></button>
        <button type="button" aria-label={t('style.save')} aria-pressed={isSaved} onClick={() => saved.toggle(page)} style={{ ...iconBtn, border: 'none', background: 'none', color: isSaved ? 'var(--color-live)' : 'var(--color-text)' }}><IconHeart size={20} filled={isSaved} /></button>
      </>
  const eyebrowColor = topic ? 'var(--color-primary-strong)' : 'var(--color-secondary)'
  const catLine = (
    <nav aria-label="Breadcrumb" style={{ padding: `12px ${px}px 0`, fontSize: 12, color: hostArt ? 'var(--color-text-3)' : 'var(--color-disabled)' }}>
      {hostArt ? <><Link to="/" style={{ color: 'var(--color-text-3)' }}>{t('style.home')}</Link> › <Link to="/hosts" style={{ color: 'var(--color-text-3)' }}>{t('style.host')}</Link> › <Link to={`/hosts/${page.author_slug}`} style={{ color: 'var(--color-text-3)' }}>{page.author}</Link> › {t('style.journal')}</> : <><Link to="/" style={{ color: 'var(--color-disabled)' }}>{t('style.home')}</Link> › {hostArt ? <Link to={`/hosts/${page.author_slug}`} style={{ color: 'var(--color-disabled)' }}>{page.author}</Link> : <Link to="/style" style={{ color: 'var(--color-disabled)' }}>{topic ? t('style.style_topics') : t('style.title')}</Link>}
      {topic ? <> › {page.title.split(':')[0]}</> : <> › <Link to="/style" style={{ color: 'var(--color-disabled)' }}>{page.category_label}</Link></>}</>}
    </nav>
  )
  return (
    <article>
      {!desktop && <PageHeader title="" to={hostArt ? `/hosts/${page.author_slug}` : '/style'} right={right} height={topic || hostArt ? 58 : 56} gap={topic || hostArt ? 8 : 4} />}
      {catLine}
      <header style={{ padding: `10px ${px}px ${hostArt ? 14 : 16}px`, display: 'flex', flexDirection: 'column', gap: topic ? 8 : 10, maxWidth: desktop ? 820 : 'none', margin: desktop ? '0 auto' : 0 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: hostArt ? 'var(--color-primary-strong)' : eyebrowColor }}>{topic ? t('style.eyebrow_topic') : customType && d.type_name ? [d.type_name, page.category_label].filter(Boolean).join(' · ') : page.category_label}</span>
        <h1 style={{ margin: 0, fontSize: desktop ? 34 : 26, fontWeight: 700, lineHeight: hostArt ? 1.4 : 1.35 }}>{page.title}</h1>
        {hostArt ? (
          <Link to={`/hosts/${page.author_slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--color-text)' }}>
            {d.hosts[0]?.avatar_url && <img src={sized(img(d.hosts[0].avatar_url), 80)} alt="" onError={onImgError} style={{ width: 40, height: 40, borderRadius: 20, objectFit: 'cover', objectPosition: '30% 15%' }} />}
            <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{page.author}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{d.author_height_cm ? `${d.author_height_cm} cm・` : ''}{dateDots(page.published_at)}</span></span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('style.host_page')}</span>
          </Link>
        ) : topic
          ? <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{dateDots(page.published_at)}{page.author ? `・${t('style.by', { name: page.author })}` : ''}{page.read_minutes ? `・${t('style.read_min', { n: page.read_minutes })}` : ''}</span>
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-2)' }}>
              {d.hosts[0]?.avatar_url && <img src={sized(img(d.hosts[0].avatar_url), 80)} alt="" onError={onImgError} style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', objectPosition: '30% 15%' }} />}
              <span><b style={{ color: 'var(--color-text)' }}>{page.author}</b>・{dateDots(page.published_at)}{page.read_minutes ? `・${t('style.read_min', { n: page.read_minutes })}` : ''}</span>
            </div>
          )}
      </header>
      {/* one uploaded image is both the list thumbnail and this banner: it keeps a fixed shape (4:3 phone, 16:9 desktop) instead of a fixed height */}
      {page.cover_url && <img src={sized(img(page.cover_url), 1200)} srcSet={[640, 900, 1200, 1600].map((w) => `${sized(img(page.cover_url), w)} ${w}w`).join(', ')} sizes="100vw" alt={page.cover_alt || page.title} fetchpriority="high" onError={onImgError} style={{ width: '100%', aspectRatio: desktop ? '16 / 9' : '4 / 3', maxHeight: desktop ? 520 : 'none', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />}
      <div style={{ padding: `${hostArt ? 18 : 20}px ${px}px 0`, display: 'flex', flexDirection: 'column', gap: hostArt ? 14 : 16, maxWidth: desktop ? 820 : 'none', margin: desktop ? '0 auto' : 0 }}>
        {d.intro_html
          ? <div className="article-rich article-rich-block" style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--color-text)' }} dangerouslySetInnerHTML={{ __html: safeHtml(d.intro_html) }} />
          : page.summary && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, whiteSpace: 'pre-line' }}>{page.summary}</p>}
        {!topic && toc.length > 1 && tocBox(toc, t)}
        <Blocks blocks={d.blocks} products={d.products} topic={topic} hostName={hostArt ? page.author : ''} />
        {!topic && page.tags?.length > 0 && !d.blocks.some((b) => b.type === 'tags') && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{page.tags.map((x) => <Link key={x} to="/style" style={tagPill}>#{x}</Link>)}</div>}
      </div>

      {d.products.length > 0 && (
        <section style={{ padding: `${hostArt ? 24 : 28}px 0 0` }}>
          <div style={{ padding: `0 ${px}px ${topic ? 14 : hostArt ? 12 : 0}px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{hostArt ? 'SHOP THE NOTE' : topic ? 'SHOP THE TOPIC' : 'SHOP THE LOOK'}</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{hostArt ? t('style.shop_note') : topic ? t('style.shop_topic') : t('style.shop_look')}</h2></div>
              {!hostArt && <Link to="/products" style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{t('style.see_all')}</Link>}
            </div>
          </div>
          {topic || hostArt
            ? <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: `0 ${px}px 4px` }}>{d.products.map((p) => <StripCard key={p.id} p={p} />)}</div>
            : <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 5 : 2}, minmax(0, 1fr))`, gap: '16px 12px', padding: `14px ${px}px 0` }}>{d.products.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
        </section>
      )}
      {topic && d.categories.length > 0 && (
        <section style={{ padding: `24px ${px}px 0` }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700 }}>{t('style.categories')}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{d.categories.map((c) => <Link key={c.name} to={`/c/${encodeURIComponent(c.name)}`} style={{ minHeight: 36, padding: '0 14px', borderRadius: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'content-box' }}>{c.display} ›</Link>)}</div>
        </section>
      )}
      {d.hosts.length > 0 && topic && (
        <section style={{ padding: '24px 0 0' }}>
          <SectionHead eyebrow="HOSTS" title={t('style.hosts_wear')} to="/hosts" linkLabel={t('style.see_all')} />
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: `0 ${px}px 4px` }}>{d.hosts.map((h) => <HostCard key={h.id} h={h} width={140} />)}</div>
        </section>
      )}
      {d.related.length > 0 && (
        <section style={{ padding: `${topic || hostArt ? 24 : 28}px ${px}px 0` }}>
          {topic
            ? <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{t('style.other_topics')}</h2>
            : <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{hostArt ? `MORE FROM ${page.author}` : 'RELATED'}</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{hostArt ? t('style.more_from', { name: page.author }) : t('style.related')}</h2></div></div>}
          <div style={{ marginTop: topic || hostArt ? 0 : 8 }}>
            {d.related.map((c) => (
              <Link key={c.id} to={href(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
                <img src={sized(img(c.cover_url), 160)} alt="" loading="lazy" onError={onImgError} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
                {topic
                  ? <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{c.title}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{c.summary}</span></span>
                  : hostArt ? <b style={{ fontSize: 15 }}>{c.title}</b> : <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-secondary)' }}>{c.category_label}</span><b style={{ fontSize: 15, lineHeight: 1.45 }}>{c.title}</b></span>}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div style={{ height: 120 }} />
    </article>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getContent, img, onImgError, sized } from '../lib/api'
import { fullDate } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useArticleFavs } from '../lib/articleFavs'
import { HostCard } from '../components/HostCard'
import { IconHeart, IconMenu, IconSearch, IconShare } from '../components/Icons'
import { ProductCard, StripCard } from '../components/ProductCard'
import { EmptyState, ErrorState, iconBtn, PageHeader, SectionHead, Skeleton, btnPrimary } from '../components/ui'

// Topic / article / host-journal page (artboards Topic / Article). Body = blocks {type: h2|h3|p|list|image|product|products|tags}.
function Blocks({ blocks, products, topic, toc }) {
  const { t } = useTranslation()
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  let tocDone = false
  return (
    <>
      {blocks.map((b, i) => {
        const out = []
        if (b.type === 'h2') out.push(<h2 key={i} id={`s${i}`} style={{ margin: topic ? 0 : '8px 0 0', fontSize: 20, fontWeight: 700 }}>{b.text}</h2>)
        else if (b.type === 'h3') out.push(<h3 key={i} style={{ margin: '8px 0 0', fontSize: 17 }}>{b.text}</h3>)
        else if (b.type === 'list') out.push(<ul key={i} style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{(b.items || []).map((x) => <li key={x}>{x}</li>)}</ul>)
        else if (b.type === 'image') out.push(
          <figure key={i} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <img src={sized(img(b.url), 900)} alt={b.alt || ''} loading="lazy" onError={onImgError} style={{ width: '100%', height: 320, borderRadius: 16, objectFit: 'cover', objectPosition: 'center 25%' }} />
            {(b.caption || b.alt) && <figcaption style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{b.caption || b.alt}</figcaption>}
          </figure>)
        else if (b.type === 'product' && byId[b.product_id]) {
          const p = byId[b.product_id]
          out.push(
            <Link key={i} to={`/p/${p.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
              <img src={sized(img(p.image), 160)} alt={p.name} loading="lazy" onError={onImgError} style={{ width: 64, height: 84, borderRadius: 10, objectFit: 'cover' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-live)', fontWeight: 700 }}>{p.live_code ? t('product.live_code_badge', { code: p.live_code }) : t('style.shop_note')}</span>
                <b style={{ fontSize: 15 }}>{p.name}</b><span style={{ fontSize: 15, fontWeight: 700 }}>NT${Math.round(p.price).toLocaleString('en-US')}</span>
              </span>
              <span style={{ flex: 'none', height: 36, padding: '0 14px', borderRadius: 18, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{t('style.view_product')}</span>
            </Link>)
        } else if (b.type === 'tags') out.push(<div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{(b.items || []).map((x) => <span key={x} style={tagPill}>#{x}</span>)}</div>)
        else out.push(<p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--color-text)', whiteSpace: 'pre-line' }}>{b.text}</p>)
        if (!tocDone && !topic && toc.length > 1 && (b.type === 'p' || !b.type)) { tocDone = true; out.push(tocBox(toc, t)) }
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
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const saved = useArticleFavs()
  const [d, setD] = useState(null)
  const [state, setState] = useState('loading')
  const load = useCallback(() => { setState('loading'); getContent(slug).then((x) => { setD(x); setState('ok') }).catch((e) => setState(e.status === 404 ? 'notfound' : 'error')) }, [slug])
  useEffect(() => { load() }, [load, i18n.language])
  const page = d?.page
  const seo = d?.seo
  useSeo({
    title: seo?.title || page?.title, description: seo?.description || page?.summary, canonical: seo?.canonical || (page ? (page.type === 'host_article' ? `/hosts/${page.author_slug}/journal/${page.slug}` : `/style/${page.slug}`) : ''),
    noindex: seo ? seo.index === false : false,
    jsonLd: page ? { '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.summary, image: page.cover_url, datePublished: page.published_at, author: { '@type': 'Person', name: page.author } } : null,
  })
  if (state === 'loading') return <div><PageHeader title="" /><Skeleton h={220} r={0} /></div>
  if (state === 'notfound') return <div><PageHeader title="" /><EmptyState title={t('style.notfound')} action={<Link to="/style" style={{ ...btnPrimary, marginTop: 8 }}>{t('style.title')}</Link>} /></div>
  if (state === 'error') return <div><PageHeader title="" /><ErrorState title={t('style.error')} onRetry={load} /></div>
  const px = desktop ? 40 : 16
  const topic = page.type === 'topic'
  const hostArt = page.type === 'host_article'
  const toc = d.blocks.map((b, i) => (b.type === 'h2' ? { i, text: b.text } : null)).filter(Boolean)
  const href = (c) => (c.type === 'host_article' ? `/hosts/${c.author_slug}/journal/${c.slug}` : `/style/${c.slug}`)
  const dateDots = (iso) => fullDate(iso).replace(/\//g, '.')
  const isSaved = saved.has(page.slug)
  const right = topic
    ? <><Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link><Link to="/menu" aria-label={t('menu.title')} style={iconBtn}><IconMenu /></Link></>
    : <>
        <button type="button" aria-label={t('style.share')} onClick={() => navigator.share?.({ title: page.title, url: window.location.href }).catch(() => {})} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconShare size={20} /></button>
        <button type="button" aria-label={t('style.save')} aria-pressed={isSaved} onClick={() => saved.toggle(page)} style={{ ...iconBtn, border: 'none', background: 'none', color: isSaved ? 'var(--color-live)' : 'var(--color-text)' }}><IconHeart size={20} filled={isSaved} /></button>
      </>
  const eyebrowColor = topic ? 'var(--color-primary-strong)' : 'var(--color-secondary)'
  const catLine = (
    <nav aria-label="Breadcrumb" style={{ padding: `12px ${px}px 0`, fontSize: 12, color: 'var(--color-disabled)' }}>
      <Link to="/" style={{ color: 'var(--color-disabled)' }}>{t('style.home')}</Link> › {hostArt ? <Link to={`/hosts/${page.author_slug}`} style={{ color: 'var(--color-disabled)' }}>{page.author}</Link> : <Link to="/style" style={{ color: 'var(--color-disabled)' }}>{topic ? t('style.style_topics') : t('style.title')}</Link>}
      {topic ? <> › {page.title.split(':')[0]}</> : <> › <Link to="/style" style={{ color: 'var(--color-disabled)' }}>{page.category_label}</Link></>}
    </nav>
  )
  return (
    <article>
      {!desktop && <PageHeader title="" to={hostArt ? `/hosts/${page.author_slug}` : '/style'} right={right} height={topic ? 58 : 56} gap={topic ? 8 : 4} />}
      {catLine}
      <header style={{ padding: `10px ${px}px 16px`, display: 'flex', flexDirection: 'column', gap: topic ? 8 : 10, maxWidth: desktop ? 820 : 'none', margin: desktop ? '0 auto' : 0 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: eyebrowColor }}>{topic ? t('style.eyebrow_topic') : page.category_label}</span>
        <h1 style={{ margin: 0, fontSize: desktop ? 34 : 26, fontWeight: 700, lineHeight: 1.35 }}>{page.title}</h1>
        {topic
          ? <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{dateDots(page.published_at)}{page.author ? `・${t('style.by', { name: page.author })}` : ''}{page.read_minutes ? `・${t('style.read_min', { n: page.read_minutes })}` : ''}</span>
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-2)' }}>
              {d.hosts[0]?.avatar_url && <img src={sized(img(d.hosts[0].avatar_url), 80)} alt="" onError={onImgError} style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', objectPosition: '30% 15%' }} />}
              <span><b style={{ color: 'var(--color-text)' }}>{page.author}</b>・{dateDots(page.published_at)}{page.read_minutes ? `・${t('style.read_min', { n: page.read_minutes })}` : ''}</span>
            </div>
          )}
      </header>
      {page.cover_url && <img src={sized(img(page.cover_url), 1200)} alt={page.cover_alt || page.title} fetchpriority="high" onError={onImgError} style={{ width: '100%', height: topic ? 280 : 300, objectFit: 'cover', objectPosition: 'center 30%', display: topic ? 'inline' : 'block' }} />}
      <div style={{ padding: `20px ${px}px 0`, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: desktop ? 820 : 'none', margin: desktop ? '0 auto' : 0 }}>
        {page.summary && !d.blocks.length && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85 }}>{page.summary}</p>}
        <Blocks blocks={d.blocks} products={d.products} topic={topic} toc={toc} />
        {!topic && page.tags?.length > 0 && !d.blocks.some((b) => b.type === 'tags') && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>{page.tags.map((x) => <Link key={x} to="/style" style={tagPill}>#{x}</Link>)}</div>}
      </div>

      {d.products.length > 0 && (
        <section style={{ padding: `28px 0 0` }}>
          <div style={{ padding: `0 ${px}px ${topic ? 14 : 0}px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{topic ? 'SHOP THE TOPIC' : 'SHOP THE LOOK'}</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{hostArt ? t('style.shop_note') : topic ? t('style.shop_topic') : t('style.shop_look')}</h2></div>
              <Link to="/products" style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{t('style.see_all')}</Link>
            </div>
          </div>
          {topic
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
        <section style={{ padding: `${topic ? 24 : 28}px ${px}px 0` }}>
          {topic
            ? <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{t('style.other_topics')}</h2>
            : <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>RELATED</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{hostArt ? t('style.more_from', { name: page.author }) : t('style.related')}</h2></div></div>}
          <div style={{ marginTop: topic ? 0 : 8 }}>
            {d.related.map((c) => (
              <Link key={c.id} to={href(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
                <img src={sized(img(c.cover_url), 160)} alt="" loading="lazy" onError={onImgError} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
                {topic
                  ? <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{c.title}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{c.summary}</span></span>
                  : <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-secondary)' }}>{c.category_label}</span><b style={{ fontSize: 15, lineHeight: 1.45 }}>{c.title}</b></span>}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div style={{ height: 120 }} />
    </article>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { claimCoupon, getHost, getProduct, img, onImgError, sized } from '../lib/api'
import { useCart } from '../lib/cart'
import { listClaimed, saveClaimed } from '../lib/claimed'
import { downloadLiveReminder } from '../lib/ics'
import { duration, formatNumber, fullDate, money, shortDate } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { topicText, waUrl } from '../lib/wa'
import { whenLabel } from '../lib/when'
import { HostCard, LiveBadge, OffBadge } from '../components/HostCard'
import { IconCheck, IconMenu, IconPlay, IconSearch, IconTiktok } from '../components/Icons'
import { ProductCard, StripCard } from '../components/ProductCard'
import { btnOutline, btnPrimary, Chip, EmptyState, ErrorState, iconBtn, PageHeader, Skeleton } from '../components/ui'
import { IconWhatsApp } from '../components/Icons'

export default function Host() {
  const { slug } = useParams()
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const cart = useCart()
  const { settings } = useStore()
  const [d, setD] = useState(null)
  const [state, setState] = useState('loading')
  const [cat, setCat] = useState('all')
  const [tag, setTag] = useState('all')
  const [claimed, setClaimed] = useState(() => listClaimed().map((c) => c.code))

  const load = useCallback(() => {
    setState('loading')
    getHost(slug).then((x) => { setD(x); setState('ok') }).catch((e) => setState(e.status === 404 ? 'notfound' : 'error'))
  }, [slug])
  useEffect(() => { load() }, [load, i18n.language])

  const host = d?.host
  const blocks = d?.blocks || {}
  const show = (k) => blocks[k] !== false
  useSeo({
    title: host?.seo_title || host?.name, description: host?.seo_description || host?.bio || '', canonical: host ? `/hosts/${host.slug}` : '',
    jsonLd: host ? { '@context': 'https://schema.org', '@type': 'Person', name: host.name, description: host.bio, image: host.avatar_url } : null,
  })

  const worn = d?.worn || []
  const cats = useMemo(() => [...new Set(worn.map((p) => p.category).filter(Boolean))], [worn])
  const wornShown = worn.filter((p) => cat === 'all' || p.category === cat)

  if (state === 'loading') return <div><PageHeader title="" /><Skeleton h={300} r={0} /><div style={{ padding: 16 }}><Skeleton w="50%" h={28} /></div></div>
  if (state === 'notfound') return <div><PageHeader title="" /><EmptyState title={t('host.notfound')} text={t('host.notfound_text')} action={<Link to="/hosts" style={{ ...btnPrimary, marginTop: 8 }}>{t('hosts.all_hosts')}</Link>} /></div>
  if (state === 'error') return <div><PageHeader title="" /><ErrorState onRetry={load} /></div>

  const live = host.live_status === 'live'
  const px = desktop ? 40 : 16
  const hasItems = (d.showing.length + worn.length + d.picks.length + d.outfits.length) > 0

  async function claim(code) {
    try { const p = await claimCoupon(code); saveClaimed(p); setClaimed(listClaimed().map((c) => c.code)) } catch { /* shown by absence */ }
  }
  async function addOutfit(o) {
    for (const it of o.items) {
      try {
        const p = await getProduct(it.product_id)
        const v = p.variants?.find((x) => x.id === it.variant_id)
        if (v && v.stock > 0) cart.add({ variantId: v.id, productId: p.id, name: p.name, color: v.color, size: v.size, price: v.price, stock: v.stock, image: p.images?.[0] || '', liveCode: p.live_code }, 1, true)
      } catch { /* skipped */ }
    }
    cart.showToast('added')
  }

  const chips = [[t('host.height'), host.height_cm ? `${host.height_cm} cm` : ''], [t('host.weight'), host.weight_kg ? `${host.weight_kg} kg` : ''], [t('host.usual'), host.usual_size], [t('host.style'), host.style_note], [t('host.likes'), host.favorites]].filter(([, v]) => v)
  const endsToday = (c) => c.end_date && new Date(c.end_date).getTime() - Date.now() < 36 * 3600 * 1000
  const liveCoupon = live ? d.coupons.find(endsToday) : null
  const otherCoupons = d.coupons.filter((c) => c !== liveCoupon)
  const tags = [...new Set(d.outfits.map((o) => o.tag).filter(Boolean))]
  const outfits = d.outfits.filter((o) => tag === 'all' || o.tag === tag)
  const tab = (on) => ({ flex: 'none', minHeight: 36, padding: '0 14px', borderRadius: 18, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })
  const head = (eyebrow, title, to, label) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>{eyebrow}</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h2></div>
      {to && <Link to={to} style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--color-text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 16 }}>{label}</Link>}
    </div>
  )
  const pillLink = (kind) => ({ minHeight: 44, padding: '0 18px', borderRadius: 22, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box', ...(kind === 'live' ? { background: 'var(--color-live)', color: '#FFFFFF' } : kind === 'dark' ? { background: 'var(--color-text)', color: '#FFFFFF' } : { border: '1.5px solid var(--color-text)', color: 'var(--color-text)' }) })
  const couponCard = (c, tagText, live2) => {
    const head2 = c.type === 'percentage' ? t('coupons.pct', { pct: c.value }) : c.type === 'free_shipping' ? t('coupons.free') : money(c.value)
    const done = claimed.includes(c.code)
    return (
      <div key={c.code} style={{ display: 'flex', borderRadius: 16, background: 'var(--color-coupon-bg)', border: '1.5px dashed var(--color-secondary)', overflow: 'hidden' }}>
        <div style={{ flex: 'none', width: 92, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1.5px dashed var(--color-secondary)' }}><span style={{ fontSize: 12, color: 'var(--color-text)' }}>{t('host.off')}</span><b style={{ fontSize: 20, color: 'var(--color-text)', textAlign: 'center' }}>{head2}</b></div>
        <div style={{ flex: 1, minWidth: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ alignSelf: 'flex-start', padding: '2px 6px', borderRadius: 4, background: 'var(--color-text)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{tagText}</span>
          <b style={{ fontSize: 15 }}>{c.title || c.code}</b>
          {c.subtitle && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{c.subtitle}</span>}
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{c.end_date ? t('host.until', { date: live2 ? t('host.tonight') : shortDate(c.end_date) }) : ''}</span>
        </div>
        <div style={{ flex: 'none', padding: '12px 12px 12px 0', display: 'flex', alignItems: 'center' }}>
          {done ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>{t('host.claimed')}</span>
            : <button type="button" onClick={() => claim(c.code)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 20, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, border: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'content-box' }}>{t('host.claim')}</button>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 0 }}>
      {!desktop && <PageHeader title={host.name} to="/hosts" height={58} gap={8} right={<><Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link><Link to="/menu" aria-label={t('menu.title')} style={iconBtn}><IconMenu /></Link></>} />}
      <div style={{ position: 'relative', height: desktop ? 300 : 230 }}>
        <img src={sized(img(host.cover_url || host.avatar_url), 1200)} alt="" fetchpriority="high" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', background: 'var(--color-bg-soft)' }} />
        <span style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.25)' }} />
      </div>
      <section style={{ marginTop: -56, position: 'relative', padding: `0 ${px}px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <img src={sized(img(host.avatar_url), 300)} alt={host.name} onError={onImgError} style={{ width: 104, height: 104, borderRadius: 52, objectFit: 'cover', objectPosition: '30% 15%', border: '4px solid var(--color-bg)', boxShadow: live ? '0 0 0 2.5px var(--color-live)' : 'none', background: 'var(--color-bg-soft)' }} />
          <span style={{ paddingBottom: 8 }}>
            {live ? <span style={{ display: 'flex' }}><LiveBadge text={t('host.live_now')} /></span>
              : !host.has_been_live ? <span style={{ display: 'flex' }}><OffBadge /></span> : null}
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>{host.name}</h1>
        {host.bio && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--color-text)' }}>{host.bio}</p>}
        {show('intro') && chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map(([l, v]) => <span key={l} style={{ padding: '6px 10px', borderRadius: 14, background: 'var(--color-bg-soft)', fontSize: 12 }}><span style={{ color: 'var(--color-text-2)' }}>{l}</span> <b>{v}</b></span>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: host.tiktok_url ? '1.3fr 1fr' : '1fr', gap: 8 }}>
          {host.watch_url && <a href={host.watch_url} target="_blank" rel="noreferrer" style={pillLink(live ? 'live' : 'dark')}><IconPlay size={14} />{t('host.watch')}</a>}
          {host.tiktok_url && <a href={host.tiktok_url} target="_blank" rel="noreferrer" style={pillLink('outline')}><IconTiktok size={16} />{t('host.tiktok')}</a>}
        </div>
      </section>

      {show('live') && live && (
        <section style={{ margin: `22px ${px}px 0`, padding: 12, borderRadius: 20, background: 'var(--color-surface)', border: '1.5px solid var(--color-live-soft)', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 17 }}>{t('host.live_now')}{host.live_title ? `・${host.live_title}` : ''}</b>{host.viewer_count != null && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('host.viewers', { n: formatNumber(host.viewer_count) })}</span>}</div>
          <a href={host.watch_url || '#'} target="_blank" rel="noreferrer" className="live-pulse" style={{ position: 'relative', display: 'block', height: 260, borderRadius: 14, overflow: 'hidden', border: '2.5px solid var(--color-live)' }}>
            <img src={sized(img(host.avatar_url), 700)} alt={t('host.preview_alt')} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 20%' }} />
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconPlay size={22} /></span></span>
            <span style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: 11 }}>{t('host.preview_tap')}</span>
          </a>
          {liveCoupon && couponCard(liveCoupon, t('host.tag_live', { name: host.name }), true)}
          {d.showing.length > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('host.discussing')}</span>
              <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
                {d.showing.map((p, i) => (
                  <Link key={p.id} to={`/p/${p.id}`} style={{ flex: 'none', width: 100, display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--color-text)' }}>
                    <span style={{ position: 'relative', display: 'block' }}>
                      <img src={sized(img(p.image), 200)} alt={p.name} loading="lazy" onError={onImgError} style={{ width: 100, height: 128, borderRadius: 10, objectFit: 'cover' }} />
                      {i === 0 && <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 4, background: 'var(--color-live)', fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>{t('host.discussing')}</span>}
                    </span>
                    <span style={{ fontSize: 12, height: 32, overflow: 'hidden' }}>{p.name}</span>
                    <b style={{ fontSize: 13 }}>{money(p.price)}</b>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {show('live') && !live && host.next_live_at && (
        <section style={{ margin: `22px ${px}px 0`, padding: 14, borderRadius: 18, background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>{t('host.next', { when: whenLabel(host.next_live_at, t, i18n.language) })}</b>
          {host.next_live_title && <span style={{ fontSize: 14 }}>{host.next_live_title}</span>}
          <button type="button" onClick={() => downloadLiveReminder({ title: `${host.name} live`, startIso: host.next_live_at, url: host.watch_url })} style={{ ...btnOutline, height: 44, fontSize: 14, alignSelf: 'flex-start' }}>{t('host.remind')}</button>
        </section>
      )}

      {show('coupons') && otherCoupons.length > 0 && (
        <section style={{ padding: `26px ${px}px 0`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {head('COUPONS', t('host.coupons_title', { name: host.name }))}
          {otherCoupons.map((c) => couponCard(c, t('host.tag_special', { name: host.name }), false))}
        </section>
      )}

      {show('outfits') && d.outfits.length > 0 && (
        <section style={{ padding: '26px 0 0' }}>
          <div style={{ padding: `0 ${px}px 12px` }}>{head('OUTFITS', t('host.outfits_title', { name: host.name }))}</div>
          {tags.length > 0 && (
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: `0 ${px}px 12px` }}>
              {tags.map((x) => <button key={x} type="button" onClick={() => setTag(tag === x ? 'all' : x)} style={tab(tag === x || (tag === 'all' && x === tags[0] && false))}>{x}</button>)}
            </div>
          )}
          <div style={{ padding: `0 ${px}px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {outfits.map((o) => (
              <div key={o.id} style={{ borderRadius: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <img src={sized(img(o.cover_url || o.items[0]?.image), 800)} alt={o.title} loading="lazy" onError={onImgError} style={{ width: '100%', height: 300, objectFit: 'cover', objectPosition: 'center 25%' }} />
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <b style={{ fontSize: 15 }}>{o.title}</b>
                  {o.items.map((it) => (
                    <div key={it.variant_id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-primary)' }}><IconCheck size={13} /></span>
                      <img src={sized(img(it.image), 120)} alt={it.name} loading="lazy" onError={onImgError} style={{ width: 44, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                      <Link to={`/p/${it.product_id}`} style={{ flex: 1, fontSize: 13, color: 'var(--color-text)', textDecoration: 'none' }}>{it.name}<br /><span style={{ color: 'var(--color-text-2)', fontSize: 12 }}>{[it.color, it.size].filter(Boolean).join(' / ')}</span></Link>
                      <b style={{ fontSize: 15 }}>{money(it.price)}</b>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOutfit(o)} style={{ minHeight: 48, borderRadius: 24, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{t('host.add_set', { total: money(o.total) })}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {show('picks') && d.picks.length > 0 && (
        <section style={{ padding: `26px ${px}px 0` }}>
          {head('PICKS', t('host.picks_title', { name: host.name }), '/products', t('style.see_all'))}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 5 : 2}, minmax(0, 1fr))`, gap: '18px 12px', marginTop: 12 }}>
            {d.picks.map((p) => <ProductCard key={p.id} p={p} badgeKind="worn" badgeText={t('host.tag_pick', { name: host.name })} />)}
          </div>
        </section>
      )}

      {show('wardrobe') && worn.length > 0 && (
        <section style={{ padding: '26px 0 0' }}>
          <div style={{ padding: `0 ${px}px 12px` }}>{head('WARDROBE', t('host.wardrobe_title', { name: host.name }))}</div>
          {cats.length > 1 && (
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: `0 ${px}px 12px` }}>
              <Chip active={cat === 'all'} onClick={() => setCat('all')}>{t('host.all_cat')}</Chip>
              {cats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 5 : 2}, minmax(0, 1fr))`, gap: desktop ? '24px 16px' : '18px 12px', padding: `0 ${px}px` }}>
            {wornShown.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {!hasItems && (
        <EmptyState title={t('host.no_items_title', { name: host.name })} text={t('host.no_items_text')} action={<Link to="/hosts" style={{ ...btnPrimary, marginTop: 8 }}>{t('host.see_other')}</Link>} />
      )}

      {show('journal') && d.journal.length > 0 && (
        <section style={{ padding: `26px ${px}px 0` }}>
          {head('NOTES', t('host.notes_title', { name: host.name }), '/style', t('host.all_articles'))}
          {d.journal.map((a) => (
            <Link key={a.id} to={a.path || `/hosts/${host.slug}/journal/${a.slug}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text)' }}>
              <img src={sized(img(a.cover_url), 160)} alt="" loading="lazy" onError={onImgError} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{a.category_label}</span>
                <b style={{ fontSize: 15, lineHeight: 1.45 }}>{a.title}</b>
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{t('host.by', { name: host.name })}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <section style={{ margin: `24px ${px}px 0`, padding: 16, borderRadius: 18, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('host.cs_q', { name: host.name })}</b><span style={{ fontSize: 12, color: 'var(--color-border)' }}>{t('host.cs_t')}</span></span>
        <a href={waUrl(settings.whatsapp_number, `${topicText(i18n.language, 'order')}\n${host.name}`)} target="_blank" rel="noreferrer" style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#1FA855', color: '#FFFFFF', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxSizing: 'border-box' }}><IconWhatsApp size={18} stroke="#FFFFFF" />{t('common.ask_cs')}</a>
      </section>
      <div style={{ height: 130 }} />
      <span hidden><HostCard h={host} /></span>
    </div>
  )
}

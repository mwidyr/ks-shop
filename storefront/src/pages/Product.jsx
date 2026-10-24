import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getProduct, img, onImgError, requestRestock, sized } from '../lib/api'
import { useCart } from '../lib/cart'
import { useFavorites } from '../lib/favorites'
import { discountPct, money, shortDate } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { productText, waUrl } from '../lib/wa'
import { HostCard } from '../components/HostCard'
import RestockSheet from '../components/RestockSheet'
import WaSheet from '../components/WaSheet'
import { useProfile, suggestSize } from '../lib/profile'
import { getReviews } from '../lib/api'
import Stars from '../components/Stars'
import { IconCheck, IconChevDown, IconHeadphones, IconHeart, IconPlay, IconChat, IconShare } from '../components/Icons'
import { btnOutline, btnPrimary, EmptyState, ErrorState, Field, inputStyle, Sheet, Skeleton } from '../components/ui'
import { blankSize } from '../components/QuickAdd'

function Checkbox({ on, disabled, onClick, label }) {
  return (
    <span role="checkbox" aria-checked={on} aria-label={label} tabIndex={0} onClick={disabled ? undefined : onClick} onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onClick() } }}
      style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', ...(on ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' } : { border: '2px solid var(--color-border-strong)' }) }}>
      {on && <IconCheck size={13} />}
    </span>
  )
}

// "Complete the look" row: tick it, pick a size (native select of its variants), buy together.
function LookRow({ card, product, state, setState }) {
  const { t } = useTranslation()
  const variants = product?.variants?.filter((v) => v.stock > 0) || []
  const chosen = variants.find((v) => v.id === state.variantId)
  const colorsOf = [...new Set(variants.map((v) => v.color).filter(Boolean))]
  const prefix = variants.length === 1 ? `${[variants[0].color, variants[0].size].filter(Boolean).join(' / ')}・` : colorsOf.length === 1 ? `${colorsOf[0]}・` : ''
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
      <Checkbox on={state.on} label={card.name} onClick={() => setState({ ...state, on: !state.on })} />
      <img src={sized(img(card.image), 160)} alt={card.name} loading="lazy" onError={onImgError} style={{ width: 52, height: 68, borderRadius: 8, objectFit: 'cover' }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Link to={`/p/${card.id}`} style={{ fontSize: 13, color: 'var(--color-text)', textDecoration: 'none' }}>{card.name}</Link>
        {variants.length === 0 ? <span style={{ fontSize: 12, color: 'var(--color-disabled)' }}>{t('common.sold_out')}</span> : (
          <span style={{ position: 'relative', alignSelf: 'flex-start' }}>
            <select aria-label={t('product.look_choose')} value={state.variantId || ''} onChange={(e) => setState({ ...state, variantId: Number(e.target.value) || null, on: Number(e.target.value) ? true : state.on })}
              style={{ minHeight: 32, padding: '0 26px 0 10px', borderRadius: 8, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', fontSize: 12, color: 'var(--color-text)', appearance: 'none' }}>
              <option value="">{prefix}{t('product.look_choose')}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{[v.color, v.size].filter(Boolean).join(' / ')}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 6, top: 9, pointerEvents: 'none' }}><IconChevDown size={12} /></span>
          </span>
        )}
        {chosen && <span style={{ display: 'none' }}>{chosen.id}</span>}
      </span>
      <b style={{ fontSize: 15 }}>{money(card.price)}</b>
    </div>
  )
}

export default function Product() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const cart = useCart()
  const { has, toggle } = useFavorites()
  const { settings, freeShip } = useStore()
  const [p, setP] = useState(null)
  const [error, setError] = useState(null)
  const [media, setMedia] = useState(0)
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [tried, setTried] = useState(false)
  const [sizeSheet, setSizeSheet] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const [waOpen, setWaOpen] = useState(false)
  const [looks, setLooks] = useState({}) // productId -> { product, on, variantId }
  const [reviews, setReviews] = useState(null)
  const { profile } = useProfile()

  const load = useCallback(() => {
    setError(null); setP(null)
    getProduct(id).then((d) => {
      setP(d); setMedia(0); setSize(''); setTried(false)
      const inStock = (d.variants || []).filter((v) => v.stock > 0)
      const colors = [...new Set(inStock.map((v) => v.color))]
      setColor(colors[0] || d.colors?.[0] || '')
      const init = {}
      ;(d.looks || []).forEach((c) => { init[c.id] = { product: null, on: false, variantId: null } })
      setLooks(init)
      ;(d.looks || []).forEach((c) => getProduct(c.id).then((lp) => setLooks((cur) => (cur[c.id] ? { ...cur, [c.id]: { ...cur[c.id], product: lp } } : cur))).catch(() => {}))
    }).catch((e) => setError(e.status === 404 ? 'notfound' : 'error'))
  }, [id])
  useEffect(() => { load() }, [load, i18n.language])
  useEffect(() => { setReviews(null); getReviews(id).then(setReviews).catch(() => setReviews({ count: 0, average: 0, items: [] })) }, [id])

  const variants = p?.variants || []
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color))].filter(Boolean), [variants])
  const noSize = blankSize
  const sizeless = variants.length > 0 && variants.every(noSize) // sold by colour only: colour alone picks the variant
  const sizesFor = variants.filter((v) => (!color || v.color === color) && !noSize(v))
  const chosen = variants.find((v) => (!color ? colors.length <= 1 : v.color === color) && (sizeless || v.size === size))
  const f = freeShip(cart.subtotal)
  const pct = p ? discountPct(p.price, p.compare_at) : 0
  const fav = p ? has(p.id) : false
  const totalStock = variants.reduce((s, v) => s + v.stock, 0)
  const host = p?.hosts?.[0]

  useSeo({
    title: p?.name, description: p ? `${p.name} · ${money(p.price)}` : '', canonical: p ? `/p/${p.id}` : '',
    jsonLd: p ? { '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, image: p.images, description: p.description || p.name, offers: { '@type': 'Offer', priceCurrency: 'TWD', price: p.price, availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } } : null,
  })

  if (error === 'notfound') return <div><EmptyState title={t('product.not_found')} text={t('product.not_found_text')} action={<Link to="/products" style={{ ...btnPrimary, marginTop: 8 }}>{t('product.shop_all')}</Link>} /></div>
  if (error) return <div><ErrorState onRetry={load} /></div>
  if (!p) return <div><Skeleton h={desktop ? 520 : 470} r={0} /><div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton w="60%" h={22} /><Skeleton w="40%" h={30} /></div></div>

  const gallery = [...(p.images || [])]
  const hasVideo = Boolean(p.video_url)
  const mediaCount = gallery.length + (hasVideo ? 1 : 0)
  const mainImg = gallery[Math.min(media, Math.max(gallery.length - 1, 0))]
  const shareUrl = `${window.location.origin}/p/${p.id}`
  const askText = productText(i18n.language, { name: p.name, code: p.live_code, color, size, url: shareUrl })

  function addToCart() {
    setTried(true)
    if (!chosen || chosen.stock <= 0) return
    cart.add({ variantId: chosen.id, productId: p.id, name: p.name, color: chosen.color, size: chosen.size, price: chosen.price, stock: chosen.stock, image: gallery[0] || '', liveCode: p.live_code })
  }

  // Buy together: this product (needs a size) + every ticked look item that has a size chosen.
  const ticked = Object.entries(looks).filter(([, s]) => s.on)
  const lookReady = ticked.filter(([, s]) => s.variantId)
  const lookTotal = (chosen ? chosen.price : 0) + lookReady.reduce((sum, [lid, s]) => sum + (s.product?.variants?.find((v) => v.id === s.variantId)?.price || p.looks.find((c) => String(c.id) === String(lid))?.price || 0), 0)
  const lookCount = (chosen ? 1 : 0) + lookReady.length
  function addTogether() {
    setTried(true)
    if (!chosen) return
    addToCart()
    lookReady.forEach(([, s]) => {
      const v = s.product?.variants?.find((x) => x.id === s.variantId)
      if (v) cart.add({ variantId: v.id, productId: s.product.id, name: s.product.name, color: v.color, size: v.size, price: v.price, stock: v.stock, image: s.product.images?.[0] || '', liveCode: s.product.live_code }, 1, true)
    })
  }

  // Size chart (#139): one row per size from Ralulu Hub, only the measurement columns some size
  // fills in. Older products without a chart fall back to their single set of measurements.
  const sizeRows = p.size_chart?.length ? p.size_chart : (p.measurements && Object.keys(p.measurements).length ? [{ size: '', ...p.measurements }] : [])
  const sizeCols = ['bust', 'waist', 'length', 'bottom_length', 'elasticity'].filter((k) => sizeRows.some((r) => r[k]))
  const sizeNotes = sizeRows.filter((r) => r.note)
  const singleSize = sizeRows.length === 1 && !sizeRows[0].size
  const measurementKeys = sizeRows.length ? ['chart'] : []

  const info = (
    <>
      <section style={{ padding: desktop ? 0 : '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.live_code && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--color-live)', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>{t('product.live_code_badge', { code: p.live_code })}</span>}
          {host && <Link to={`/hosts/${host.slug}`} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--color-bg-soft)', color: 'var(--color-text)', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>{t('product.recommended_by', { name: host.name })}</Link>}
          {totalStock > 0 && totalStock <= 5 && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--color-bg-soft)', color: 'var(--color-text)', fontSize: 11 }}>{t('product.stock_low', { n: totalStock })}</span>}
        </span>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>{p.name}</h1>
        {/* price left, share right; when a long price leaves no room the button drops to its own line (never squeezed or wrapped) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
            <b style={{ fontSize: 26, whiteSpace: 'nowrap' }}>{money(p.price)}</b>
            {pct > 0 && <><span style={{ fontSize: 15, color: 'var(--color-text-3)', textDecoration: 'line-through' }}>{money(p.compare_at)}</span><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-live)' }}>-{pct}%</span></>}
          </div>
          <ShareButton title={p.name} text={`${p.name} · ${money(p.price)}`} url={shareUrl} native={!desktop} onCopied={() => cart.showToast(t('product.share_copied'))} />
        </div>
        {f.active && <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>{t('product.free_ship_line', { amount: money(f.threshold) })}</span>}
      </section>

      {colors.length > 1 && (
        <section style={{ padding: desktop ? '20px 0 0' : '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('product.color')}: <span style={{ fontWeight: 400 }}>{color}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label={t('product.color')}>
            {colors.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} onClick={() => { setColor(c); setSize('') }}
                style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, fontSize: 14, background: 'var(--color-surface)', color: 'var(--color-text)', border: color === c ? '2px solid var(--color-text)' : '1px solid var(--color-border)', fontWeight: color === c ? 700 : 400 }}>{c}</button>
            ))}
          </div>
        </section>
      )}

      <section style={{ padding: desktop ? '20px 0 0' : '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!sizeless && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t('product.size')}</span>
          {measurementKeys.length > 0 && <button type="button" onClick={() => setSizeSheet(true)} style={{ fontSize: 13, color: 'var(--color-primary-strong)', background: 'none', border: 'none', padding: 0 }}>{t('product.size_table')}</button>}
        </div>}
        {!sizeless && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }} role="radiogroup" aria-label={t('product.size')}>
          {sizesFor.map((v) => {
            const out = v.stock <= 0
            const on = size === v.size
            return (
              <button key={v.id} type="button" role="radio" aria-checked={on} disabled={out} onClick={() => setSize(v.size)}
                style={{ height: 44, borderRadius: 8, fontSize: 15, background: out ? 'var(--color-bg-soft)' : on ? 'var(--color-primary-soft)' : 'var(--color-surface)', color: out ? 'var(--color-disabled)' : on ? 'var(--color-primary-strong)' : 'var(--color-text)', border: out ? '1px dashed var(--color-border)' : on ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', fontWeight: on ? 700 : 400, textDecoration: out ? 'line-through' : 'none' }}>{v.size}</button>
            )
          })}
        </div>}
        {tried && !chosen && <span role="alert" style={{ fontSize: 12, color: 'var(--color-error)' }}>{t('product.choose_size_first')}</span>}
        {(() => {
          const sug = suggestSize(p.wear, profile.height, profile.weight)
          const avail = sug && sizesFor.some((v) => v.size === sug.size && v.stock > 0)
          if (sug && avail) {
            return (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 13 }}>
                {profile.weight ? t('size_rec.based', { h: profile.height, w: profile.weight }) : t('size_rec.based_h', { h: profile.height })} <b>{sug.size}</b>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.85 }}>{t('size_rec.via', { host: sug.host, hh: sug.height_cm, size: sug.size })}</span>
              </div>
            )
          }
          if (!profile.height && p.wear?.length) return <Link to="/profile" style={{ fontSize: 12, color: 'var(--color-primary-strong)' }}>{t('size_rec.set')} · {t('size_rec.set_cta')}</Link>
          return null
        })()}
        <a href={waUrl(settings.whatsapp_number, askText)} onClick={(e) => { e.preventDefault(); setWaOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, background: 'var(--color-bg-soft)', border: '1.5px solid var(--color-secondary)', textDecoration: 'none', color: 'var(--color-text)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--color-on-primary)' }}><IconHeadphones size={18} /></span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 15 }}>{t('product.cs_order')}</b>
            <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{p.live_code ? t('product.cs_order_sub', { code: p.live_code }) : t('product.cs_order_sub_plain')}</span>
          </span>
          <span style={{ fontSize: 17 }}>›</span>
        </a>
      </section>

      {p.looks?.length > 0 && (
        <section style={{ margin: desktop ? '24px 0 0' : '18px 16px 0', padding: 16, borderRadius: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: 'var(--color-primary-strong)' }}>{t('product.look_eyebrow')}</span>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('product.look_title')}</h2>
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-2)', textAlign: 'right' }}>{t('product.look_hint')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-border)', marginTop: 10 }}>
            <Checkbox on disabled label={p.name} />
            <img src={sized(img(gallery[0]), 160)} alt={p.name} loading="lazy" onError={onImgError} style={{ width: 52, height: 68, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13 }}>{p.name} {t('product.look_this')}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{chosen ? [chosen.color, chosen.size].filter(Boolean).join(' / ') : t('product.look_choose')}</span>
            </span>
            <b style={{ fontSize: 15 }}>{money(p.price)}</b>
          </div>
          {p.looks.map((c) => <LookRow key={c.id} card={c} product={looks[c.id]?.product} state={looks[c.id] || { on: false, variantId: null }} setState={(s) => setLooks((cur) => ({ ...cur, [c.id]: { ...cur[c.id], ...s } }))} />)}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 15 }}>{t('product.look_selected', { n: lookCount })}<b style={{ fontSize: 17 }}>{money(lookTotal)}</b></span>
            <button type="button" onClick={addTogether} style={{ ...btnPrimary, minHeight: 44, padding: '0 18px', borderRadius: 22 }}>{t('product.look_add')}</button>
          </div>
          <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>{t('product.look_note')}</span>
        </section>
      )}

      {p.description && (
        <section style={{ marginTop: 20, borderTop: '8px solid var(--color-bg-soft)' }}>
          <details open style={{ borderBottom: '1px solid var(--color-border)' }}>
            <summary style={{ padding: '14px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{t('product.description')}</summary>
            <div style={{ padding: '0 16px 14px', fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{p.description}</div>
          </details>
        </section>
      )}

      <section style={{ marginTop: p.description ? 0 : 20, borderTop: p.description ? 'none' : '8px solid var(--color-bg-soft)' }}>
        <details style={{ borderBottom: '1px solid var(--color-border)' }} open={Boolean(reviews?.count)}>
          <summary style={{ padding: '14px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{t('reviews.title', { n: reviews?.count || 0 })}</summary>
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews && reviews.count === 0 && <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('reviews.none')}</span>}
            {reviews?.count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Stars value={Math.round(reviews.average)} /><b>{t('reviews.avg', { avg: reviews.average.toFixed(1) })}</b></span>}
            {(reviews?.items || []).map((r) => (
              <div key={r.id} style={{ paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Stars value={r.rating} size={14} /><b>{r.name}</b><span style={{ color: 'var(--color-text-2)' }}>{r.variant}・{shortDate(r.created_at)}</span></span>
                {r.body && <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{r.body}</p>}
              </div>
            ))}
          </div>
        </details>
      </section>

      {p.hosts?.length > 0 && (
        <section style={{ padding: desktop ? '24px 0 0' : '24px 0 0' }}>
          <h2 style={{ margin: '0 16px 12px', fontSize: 15, fontWeight: 700 }}>{t('product.hosts_wore')}</h2>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 4px' }}>
            {p.hosts.map((h) => <HostCard key={h.id} h={h} width={132} />)}
          </div>
        </section>
      )}
    </>
  )

  const gal = (
    <div>
      <div style={{ position: 'relative', height: desktop ? 560 : 470, background: 'var(--color-bg-soft)', borderRadius: desktop ? 20 : 0, overflow: 'hidden' }}>
        <img src={sized(img(mainImg), 900)} alt={p.name} fetchpriority="high" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <span style={{ position: 'absolute', right: 12, bottom: 12, padding: '3px 10px', borderRadius: 12, background: 'rgba(30,30,35,0.6)', color: '#FFFFFF', fontSize: 12 }}>{t('product.media_count', { i: Math.min(media + 1, gallery.length || 1), n: mediaCount || 1 })}{hasVideo ? t('product.with_video') : ''}</span>
        {hasVideo && (
          <button type="button" onClick={() => setVideoOpen(true)} style={{ position: 'absolute', left: 12, bottom: 12, minHeight: 40, padding: '0 12px 0 10px', borderRadius: 20, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text)', fontSize: 13, fontWeight: 700, border: 'none' }}>
            {host?.avatar_url ? <img src={sized(img(host.avatar_url), 80)} alt="" onError={onImgError} style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', objectPosition: '30% 15%', marginLeft: -6 }} /> : <IconPlay size={14} />}{host ? t('product.watch_tryon', { name: host.name, dur: '' }).trim() : t('product.watch_tryon_plain')}
          </button>
        )}
      </div>
      {mediaCount > 1 && (
        <div className="no-scrollbar" style={{ display: 'flex', gap: 8, padding: '10px 16px', overflowX: 'auto' }} aria-label="Thumbnail media">
          {gallery.map((u, i) => (
            <button key={u + i} type="button" onClick={() => setMedia(i)} aria-label={`${i + 1}`} style={{ position: 'relative', flex: 'none', width: 56, height: 72, borderRadius: 10, overflow: 'hidden', padding: 0, boxSizing: 'border-box', background: 'none', border: i === media ? '2px solid var(--color-text)' : '1px solid var(--color-border)' }}>
              <img src={sized(img(u), 120)} alt="" loading="lazy" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
          {hasVideo && (
            <button type="button" onClick={() => setVideoOpen(true)} aria-label={t('product.video_alt')} style={{ position: 'relative', flex: 'none', width: 56, height: 72, borderRadius: 10, overflow: 'hidden', padding: 0, border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
              {p.video_poster_url && <img src={sized(img(p.video_poster_url), 120)} alt="" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <span style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><IconPlay size={16} /></span>
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ paddingBottom: desktop ? 40 : 96 }}>
      {desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: '32px 40px 0' }}>
          <div style={{ position: 'sticky', top: 96, alignSelf: 'start' }}>{gal}</div>
          <div>
            {info}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <a href={waUrl(settings.whatsapp_number, askText)} target="_blank" rel="noreferrer" style={{ ...btnOutline, borderRadius: 12, padding: '0 22px' }}><IconChat size={18} />{t('product.ask_cs_bar')}</a>
              {totalStock > 0 ? <button type="button" onClick={addToCart} style={{ ...btnPrimary, flex: 1, borderRadius: 12 }}>{t('common.add_to_cart')}</button>
                : <button type="button" onClick={() => setRestockOpen(true)} style={{ ...btnPrimary, flex: 1, borderRadius: 12 }}>{t('product.restock')}</button>}
              <button type="button" aria-pressed={fav} aria-label={t('product.favorite')} onClick={() => toggle({ id: p.id, price: p.price, name: p.name, image: gallery[0] })} style={{ width: 48, height: 48, borderRadius: 12, border: '1.5px solid var(--color-border-strong)', background: 'var(--color-surface)', color: fav ? 'var(--color-live)' : 'var(--color-text)' }}><IconHeart filled={fav} /></button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {gal}
          {info}
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 76, padding: '12px 16px', boxSizing: 'border-box', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 10, zIndex: 35, maxWidth: 560, margin: '0 auto' }}>
            <a href={waUrl(settings.whatsapp_number, askText)} onClick={(e) => { e.preventDefault(); setWaOpen(true) }} style={{ flex: 'none', width: 104, borderRadius: 12, border: '1.5px solid var(--color-text)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}><IconChat size={18} />{t('product.ask_cs_bar')}</a>
            {totalStock > 0
              ? <button type="button" onClick={addToCart} style={{ flex: 1, borderRadius: 12, background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', fontSize: 15, fontWeight: 700 }}>{t('common.add_to_cart')}</button>
              : <button type="button" onClick={() => setRestockOpen(true)} style={{ flex: 1, borderRadius: 12, background: 'var(--color-text)', color: 'var(--color-bg)', border: 'none', fontSize: 15, fontWeight: 700 }}>{t('product.restock')}</button>}
          </div>
        </>
      )}

      <Sheet open={sizeSheet} onClose={() => setSizeSheet(false)} title={t('product.size_table_title')}>
        {singleSize ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              {[...sizeCols, ...(sizeRows[0].note ? ['note'] : [])].map((k) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 4px', fontWeight: 700, width: '40%' }}>{t(`product.m_${k}`)}</th>
                  <td style={{ padding: '10px 4px', color: 'var(--color-text-2)', whiteSpace: 'pre-line' }}>{sizeRows[0][k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: 120 + sizeCols.length * 90, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 6px', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--color-bg)' }}>{t('product.size')}</th>
                    {sizeCols.map((k) => <th key={k} style={{ textAlign: 'left', padding: '10px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t(`product.m_${k}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sizeRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 6px', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--color-bg)' }}>{r.size || '–'}</th>
                      {sizeCols.map((k) => <td key={k} style={{ padding: '10px 6px', color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>{r[k] || '–'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sizeNotes.map((r, i) => (
              <p key={i} style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-text-2)', whiteSpace: 'pre-line' }}>
                {r.size ? <b style={{ color: 'var(--color-text)' }}>{r.size}: </b> : null}{r.note}
              </p>
            ))}
          </>
        )}
      </Sheet>
      <Sheet open={videoOpen} onClose={() => setVideoOpen(false)} title={t('product.video_alt')}>
        {hasVideo && (
          <>
            <video src={p.video_url} poster={p.video_poster_url || undefined} controls playsInline preload="none" style={{ width: '100%', maxHeight: '60vh', borderRadius: 14, background: '#000' }} />
            <span style={{ display: 'block', margin: '8px 0', fontSize: 12, color: 'var(--color-text-2)' }}>{t('product.video_hint')}</span>
            {host && <Link to={`/hosts/${host.slug}`} style={{ fontSize: 14, fontWeight: 700 }}>{t('product.see_host', { name: host.name })}</Link>}
          </>
        )}
      </Sheet>
      <WaSheet open={waOpen} onClose={() => setWaOpen(false)} title={t('product.wa_title')} subtitle={t('product.wa_hint')} message={askText} url={waUrl(settings.whatsapp_number, askText)} number={settings.whatsapp_number} preview={{ image: gallery[0], title: `${p.name} | ${settings.shop_name || 'ralulu'}`, link: shareUrl.replace(/^https?:\/\//, '') }} note={t('product.wa_note')} />
      <RestockSheet open={restockOpen} onClose={() => setRestockOpen(false)} productId={p.id} variantId={chosen?.id} />
        </div>
  )
}

// "Bagikan ke Teman": the phone's native share sheet (the link's preview - image, name, description - comes from the
// Open Graph tags the server adds for /p/{id}); on desktop it copies the product link. One line, never wraps.
function ShareButton({ title, text, url, native, onCopied }) {
  const { t } = useTranslation()
  async function copy() {
    try { await navigator.clipboard.writeText(url) } catch {
      // plain-HTTP / old browsers: select-and-copy fallback
      const ta = document.createElement('textarea')
      ta.value = url; ta.style.position = 'fixed'; ta.style.left = '-9999px'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      document.body.removeChild(ta)
    }
    onCopied()
  }
  async function share() {
    if (native && navigator.share) {
      try { await navigator.share({ title, text, url }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    copy()
  }
  return (
    <button type="button" onClick={share} style={{ flex: 'none', marginLeft: 'auto', height: 36, padding: '0 12px', borderRadius: 18, border: '1px solid var(--color-border-strong, #D1D5DB)', background: '#FFFFFF', color: '#2B2B2E', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer' }}>
      <IconShare size={16} />{t('product.share_friends')}
    </button>
  )
}

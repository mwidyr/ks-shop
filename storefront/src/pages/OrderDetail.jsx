import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getWhatsAppOrder, img, onImgError, sized, submitReview, trackOrder } from '../lib/api'
import Stars from '../components/Stars'
import { money, orderTab, shortDateTime } from '../lib/format'
import { listLocalOrders } from '../lib/localOrders'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { orderText, waUrl } from '../lib/wa'
import { IconHeadset, IconWhatsApp } from '../components/Icons'
import { btnDark, btnOutline, btnPrimary, btnWhatsApp, ErrorState, Field, inputStyle, PageHeader, Sheet, Spinner } from '../components/ui'

const STEPS = ['created', 'shipped', 'hub', 'store', 'ready']
const reached = (status) => ({ pending: 1, picking: 1, ready_to_ship: 1, shipped: 3, delivered: 5, return: 5, cancelled: 0 }[status] ?? 1)

export default function OrderDetail() {
  const { orderNo } = useParams()
  const { t, i18n } = useTranslation()
  const { settings } = useStore()
  const local = listLocalOrders().find((o) => o.orderNo === orderNo)
  const [phone, setPhone] = useState(local?.phone || '')
  const [o, setO] = useState(null)
  const [state, setState] = useState(local ? 'loading' : 'ask')
  const [wa, setWa] = useState(null)
  const [rv, setRv] = useState(null) // item being reviewed
  useSeo({ title: t('order.title'), noindex: true })

  function load(p) {
    setState('loading')
    trackOrder(orderNo, p).then((d) => { setO(d); setState('ok') }).catch(() => setState('error'))
    getWhatsAppOrder(orderNo, p).then(setWa).catch(() => setWa(null))
  }
  useEffect(() => { if (local) load(local.phone) }, [orderNo, i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'ask') {
    return (
      <div><PageHeader title={t('order.title')} to="/orders" />
        <form onSubmit={(e) => { e.preventDefault(); load(phone.trim()) }} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('order.need_phone')} htmlFor="d-ph"><input id="d-ph" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" style={inputStyle(false)} /></Field>
          <button type="submit" disabled={!phone.trim()} style={{ ...btnDark, height: 48 }}>{t('order.see')}</button>
        </form>
      </div>
    )
  }
  if (state === 'loading') return <div><PageHeader title={t('order.title')} to="/orders" /><Spinner label={t('common.loading')} /></div>
  if (state === 'error' || !o) return <div><PageHeader title={t('order.title')} to="/orders" /><ErrorState title={t('orders.not_found')} onRetry={() => setState('ask')} /></div>

  const tabKey = orderTab(o.status)
  const n = reached(o.status)
  const home = o.chain_type === 'courier'
  const askUrl = waUrl(settings.whatsapp_number, orderText(i18n.language, o.order_no))
  const HERO = { pending: 'var(--color-warning)', processing: 'var(--color-info)', shipping: 'var(--color-primary)', done: 'var(--color-text-3)', return: 'var(--color-error)' }
  const heroBg = HERO[tabKey] || HERO.processing
  const heroText = tabKey === 'shipping' ? 'var(--color-on-primary)' : '#FFFFFF'
  const stamp = { 0: shortDateTime(o.created_at), 1: n >= 2 ? shortDateTime(o.updated_at || o.created_at) : '' }
  const subs = [stamp[0], stamp[1], '', '', t('order.pickup_limit')]
  const check = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('order.title')} to="/orders" />
      <section style={{ padding: '18px 16px', background: heroBg, color: heroText, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, color: tabKey === 'shipping' ? 'var(--color-border)' : 'rgba(255,255,255,0.8)' }}>#{o.order_no}</span>
        <span style={{ fontSize: 20, fontWeight: 900 }}>{tabKey === 'return' ? t('orders.status.return') : t(`orders.tabs.${tabKey === 'all' ? 'processing' : tabKey}`)}</span>
        <span style={{ fontSize: 15 }}>{t(`order.hero_${tabKey === 'all' ? 'processing' : tabKey}`)}</span>
      </section>
      <section style={{ margin: '12px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('order.progress')}</h2></div>
        <div>
          {STEPS.map((k, i) => {
            const done = i < n
            const current = i === n
            const last = i === STEPS.length - 1
            return (
              <div key={k} style={{ display: 'flex', gap: 12 }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, background: done ? 'var(--color-primary)' : 'var(--color-surface)', border: `2px solid ${done || current ? 'var(--color-primary-strong)' : 'var(--color-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', color: 'var(--color-on-primary)' }}>{done && check}</span>
                  {!last && <span style={{ flex: 1, width: 2, minHeight: 28, background: done ? 'var(--color-primary)' : 'var(--color-border)' }} />}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', paddingBottom: 14 }}>
                  <b style={{ fontSize: 15, color: done || current ? 'var(--color-text)' : 'var(--color-disabled)' }}>{t(`order.s_${k}`)}</b>
                  {subs[i] && <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{subs[i]}</span>}
                </span>
              </div>
            )
          })}
        </div>
        {o.tracking && <div style={{ fontSize: 13 }}>{t('order.tracking')}: <b>{o.tracking}</b></div>}
      </section>
      <section style={{ margin: '12px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('order.pickup_info')}</h2></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-label={o.chain} style={{ flex: 'none', padding: '3px 6px', borderRadius: 6, background: 'var(--color-surface)', border: '1.5px dashed var(--color-border-strong)', color: 'var(--color-text)', fontSize: 11, fontWeight: 700 }}>{o.chain}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
            {home ? <b style={{ fontSize: 15 }}>{t('order.home')}</b> : <b style={{ fontSize: 15 }}>{o.store_name}</b>}
            <span style={{ color: 'var(--color-text-2)' }}>{o.shipping_address}</span>
            <span>{t('order.picker')}: {o.customer_name}・{t('order.pay_store')} <b>{money(o.total)}</b></span>
          </span>
        </div>
        {!home && <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-soft)', fontSize: 12, color: 'var(--color-text)' }}>{t('order.hint')}</div>}
        {!home && o.store_verified === false && <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>{t('order.unverified')}</span>}
      </section>
      <section style={{ margin: '12px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('order.items')}</h2></div>
        {o.items.map((i) => (
          <div key={i.id} style={{ display: 'flex', gap: 10 }}>
            <img src={sized(img(i.image), 120)} alt={i.name} onError={onImgError} style={{ width: 48, height: 64, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{i.name}<br /><span style={{ color: 'var(--color-text-2)' }}>{[i.color, i.size].filter(Boolean).join(' / ')} × {i.qty}</span></span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <b>{money(i.price * i.qty)}</b>
              {o.status === 'delivered' && (i.reviewed
                ? <span style={{ fontSize: 12, color: 'var(--color-success)' }}>✓ {t('reviews.done')}</span>
                : <button type="button" onClick={() => setRv({ item: i, rating: 5, body: '', state: 'idle', error: '' })} style={{ ...btnOutline, minHeight: 32, height: 32, fontSize: 12, padding: '0 12px' }}>{t('reviews.write')}</button>)}
            </span>
          </div>
        ))}
      </section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 16px 0' }}>
        <a href={askUrl} target="_blank" rel="noreferrer" style={{ height: 52, borderRadius: 14, background: 'var(--color-text)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
          <IconHeadset size={18} />{t('order.ask_cs')}
        </a>
        {wa?.url && <a href={wa.url} target="_blank" rel="noreferrer" style={btnWhatsApp}><IconWhatsApp size={18} />{t('order.send_wa')}</a>}
        {o.status === 'delivered' && <Link to={`/orders/${o.order_no}/return`} style={btnOutline}>{t('orders.return_btn')}</Link>}
      </div>
      <Sheet open={Boolean(rv)} onClose={() => setRv(null)} title={rv ? t('reviews.for', { name: rv.item.name }) : ''}
        footer={rv && rv.state !== 'done' ? <button type="button" disabled={rv.state === 'sending'} onClick={async () => {
          setRv({ ...rv, state: 'sending', error: '' })
          try { await submitReview({ order_no: orderNo, phone, item_id: rv.item.id, rating: rv.rating, body: rv.body }); setRv({ ...rv, state: 'done' }); load(phone) } catch (e) { setRv({ ...rv, state: 'idle', error: e.message || t('reviews.error') }) }
        }} style={{ ...btnPrimary, width: '100%' }}>{t('reviews.submit')}</button> : null}>
        {rv && (rv.state === 'done' ? <b>{t('reviews.thanks')}</b> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <b style={{ fontSize: 14 }}>{t('reviews.rating')}</b>
            <div role="radiogroup" aria-label={t('reviews.rating')} style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rv.rating === n} aria-label={t('reviews.stars', { n })} onClick={() => setRv({ ...rv, rating: n })} style={{ border: 'none', background: 'none', padding: 4 }}><Stars value={n <= rv.rating ? n : 0} size={32} /></button>
              ))}
            </div>
            <textarea rows={4} value={rv.body} onChange={(e) => setRv({ ...rv, body: e.target.value })} placeholder={t('reviews.body')} aria-label={t('reviews.body')} style={{ ...inputStyle(false), minHeight: 96, padding: 12 }} />
            {rv.error && <span role="alert" style={{ color: 'var(--color-error)', fontSize: 13 }}>{rv.error}</span>}
          </div>
        ))}
      </Sheet>
    </div>
  )
}

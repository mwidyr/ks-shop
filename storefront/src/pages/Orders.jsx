import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMemberOrders, img, onImgError, sized, trackOrder } from '../lib/api'
import { useMember } from '../lib/member'
import { useSearchParams } from 'react-router-dom'
import { money, orderTab, shortDate } from '../lib/format'
import { listLocalOrders, saveLocalOrder } from '../lib/localOrders'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { orderText, waUrl } from '../lib/wa'
import { btnDark, EmptyState, Field, inputStyle, PageHeader, Spinner } from '../components/ui'

const TABS = ['all', 'pending', 'processing', 'shipping', 'done', 'return']

export default function Orders() {
  const { t, i18n } = useTranslation()
  const { settings } = useStore()
  const { signedIn } = useMember()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(TABS.includes(sp.get('tab')) ? sp.get('tab') : 'all')
  const [orders, setOrders] = useState(null)
  const [no, setNo] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  useSeo({ title: t('orders.title'), noindex: true })

  async function load() {
    let local = listLocalOrders()
    if (signedIn) {
      try {
        const remote = await getMemberOrders()
        const seen = new Set(local.map((o) => o.orderNo))
        local = [...local, ...remote.filter((o) => !seen.has(o.order_no)).map((o) => ({ orderNo: o.order_no, phone: o.phone }))]
      } catch { /* device list still shown */ }
    }
    const res = await Promise.all(local.map((o) => trackOrder(o.orderNo, o.phone).then((d) => ({ ...d, phone: o.phone })).catch(() => null)))
    setOrders(res.filter(Boolean))
  }
  useEffect(() => { load() }, [i18n.language, signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  async function find(e) {
    e.preventDefault(); setErr('')
    try {
      const d = await trackOrder(no.trim(), phone.trim())
      saveLocalOrder({ orderNo: d.order_no, phone: phone.trim(), total: d.total })
      setNo(''); setPhone(''); load()
    } catch { setErr(t('orders.not_found')) }
  }

  const shown = (orders || []).filter((o) => tab === 'all' || orderTab(o.status) === tab)
  const counts = (orders || []).reduce((m, o) => { const k = orderTab(o.status); m[k] = (m[k] || 0) + 1; return m }, {})
  const showLookup = orders !== null && (orders.length === 0 || sp.get('find'))
  const BADGE = { pending: 'var(--color-warning)', processing: 'var(--color-info)', shipping: 'var(--color-primary)', done: 'var(--color-text-3)', return: 'var(--color-error)' }
  const btn = { height: 40, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', textDecoration: 'none' }
  const btnMain = { ...btn, border: 'none', background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
  const STEPS = ['sent', 'hub', 'store', 'ready']
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('orders.title')} to="/member" />
      <div className="no-scrollbar" style={{ display: 'flex', gap: 18, padding: '0 16px', overflowX: 'auto', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 'none', padding: '12px 2px 10px', fontSize: 15, fontWeight: tab === k ? 700 : 400, color: tab === k ? 'var(--color-text)' : 'var(--color-text-2)', background: 'none', border: 'none', borderBottom: `3px solid ${tab === k ? 'var(--color-primary-strong)' : 'transparent'}`, fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'content-box' }}>
            {t(`orders.tabs.${k}`)}{k !== 'all' && k !== 'done' && counts[k] ? ` ${counts[k]}` : ''}
          </button>
        ))}
      </div>
      {orders === null && <Spinner label={t('orders.loading')} />}
      {orders && shown.length === 0 && tab === 'all' && <EmptyState title={t('orders.empty_title')} text={t('orders.empty_text')} />}
      {shown.map((o) => {
        const first = o.items[0]
        const tabKey = orderTab(o.status)
        const store = o.chain_type === 'courier' ? t('order.home') : `${o.chain} ${o.store_name || ''}`.trim()
        const qtyLine = (i) => `${[i.color, i.size].filter(Boolean).join(' / ')}${i.qty > 1 || o.items.length === 1 ? ` × ${i.qty}` : ''}`
        const lines = o.items.length === 1 ? qtyLine(first) : o.items.map((i) => [i.color, i.size].filter(Boolean).join(' / ')).join('・')
        const title = o.items.length > 1 ? t('orders.and_more', { name: first.name, n: o.items.length - 1 }) : first?.name
        const note = t(`orders.note_${tabKey === 'all' ? 'processing' : tabKey}`, { store, total: money(o.total), date: shortDate(o.updated_at || o.created_at) })
        const label = tabKey === 'return' ? t('orders.status.return') : t(`orders.tabs.${tabKey}`)
        const step = o.status === 'shipped' ? 2 : 0
        return (
          <section key={o.order_no} style={{ margin: '12px 16px 0', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ padding: '3px 8px', borderRadius: 6, background: BADGE[tabKey] || BADGE.processing, color: tabKey === 'shipping' ? 'var(--color-on-primary)' : '#FFFFFF', fontSize: 12, fontWeight: 700 }}>{label}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>#{o.order_no}</span>
            </div>
            <Link to={`/orders/${o.order_no}`} style={{ display: 'flex', gap: 10, padding: '12px 14px', textDecoration: 'none', color: 'var(--color-text)' }}>
              {first && <img src={sized(img(first.image), 120)} alt={first.name} onError={onImgError} style={{ width: 56, height: 74, borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 15 }}>{title}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{lines}</span></span>
              <b style={{ fontSize: 15 }}>{money(o.total)}</b>
            </Link>
            {tabKey === 'shipping' && (
              <div style={{ margin: '0 14px 10px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, fontSize: 11, textAlign: 'center', color: 'var(--color-text-2)' }}>
                {STEPS.map((k, i) => (
                  <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...(i === step ? { fontWeight: 700, color: 'var(--color-text)' } : {}) }}>
                    <span style={{ height: 5, borderRadius: 3, background: i < step ? 'var(--color-primary)' : i === step ? 'var(--color-secondary)' : 'var(--color-border)' }} />{t(`orders.step_${k}`)}
                  </span>
                ))}
              </div>
            )}
            <div style={{ margin: '0 14px', padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-soft)', fontSize: 13, color: 'var(--color-text)' }} dangerouslySetInnerHTML={{ __html: note }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 14px' }}>
              {tabKey === 'done' ? (
                <>
                  <Link to={`/orders/${o.order_no}/return`} style={btn}>{t('orders.return_btn')}</Link>
                  <Link to={first ? `/p/${first.product_id}` : '/'} style={btnMain}>{t('orders.again')}</Link>
                </>
              ) : (
                <>
                  <a href={waUrl(settings.whatsapp_number, orderText(i18n.language, o.order_no))} target="_blank" rel="noreferrer" style={btn}>{t('orders.ask_cs')}</a>
                  {tabKey === 'processing' && <a href={waUrl(settings.whatsapp_number, orderText(i18n.language, o.order_no))} target="_blank" rel="noreferrer" style={btn}>{t('orders.change')}</a>}
                  {tabKey === 'shipping' && <Link to={`/orders/${o.order_no}`} style={btnMain}>{t('orders.track')}</Link>}
                  {tabKey === 'pending' && <Link to={`/orders/${o.order_no}`} style={btnMain}>{t('orders.detail')}</Link>}
                  {tabKey === 'return' && <Link to={`/orders/${o.order_no}`} style={btnMain}>{t('orders.progress')}</Link>}
                </>
              )}
            </div>
          </section>
        )
      })}
      {showLookup && <form onSubmit={find} style={{ margin: '24px 16px 0', padding: 16, borderRadius: 16, background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b>{t('orders.lookup')}</b>
        <Field label={t('orders.order_no')} htmlFor="o-no"><input id="o-no" value={no} onChange={(e) => setNo(e.target.value)} style={inputStyle(false)} /></Field>
        <Field label={t('orders.phone')} htmlFor="o-ph" error={err}><input id="o-ph" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" style={inputStyle(Boolean(err))} /></Field>
        <button type="submit" disabled={!no.trim() || !phone.trim()} style={{ ...btnDark, height: 48 }}>{t('orders.find')}</button>
      </form>}
    </div>
  )
}

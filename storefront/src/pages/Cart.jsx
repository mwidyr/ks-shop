import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { img, onImgError, sized } from '../lib/api'
import { useCart } from '../lib/cart'
import { money } from '../lib/format'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { cartText } from '../lib/wa'
import { useCs } from '../lib/cs'
import { IconBack, IconCheck, IconHeadset } from '../components/Icons'
import { asBtn, btnPrimary, EmptyState, iconBtn } from '../components/ui'

function Box({ on, onClick, label }) {
  return (
    <span role="checkbox" aria-checked={on} aria-label={label} tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onClick() } }}
      style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...(on ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' } : { border: '2px solid var(--color-border-strong)' }) }}>
      {on && <IconCheck size={14} />}
    </span>
  )
}

export default function Cart() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { desktop } = useOutletContext()
  const cart = useCart()
  const { freeShip } = useStore()
  const { openCs } = useCs()
  useSeo({ title: t('nav.cart'), noindex: true })
  const f = freeShip(cart.selectedSubtotal)
  const allOn = cart.items.length > 0 && cart.items.every((i) => i.selected !== false)
  const none = cart.selected.length === 0

  const header = (
    <header style={{ height: 58, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
      <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} style={{ ...iconBtn, border: 'none', background: 'none' }}><IconBack /></button>
      <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t('cart.title', { n: cart.count })}</h1>
    </header>
  )

  if (cart.items.length === 0) {
    return (
      <div>{!desktop && header}<EmptyState title={t('cart.empty_title')} text={t('cart.empty_text')} action={<Link to="/products" style={{ ...btnPrimary, marginTop: 8 }}>{t('cart.shop')}</Link>} /></div>
    )
  }

  // "Ask CS to order for me": the ticked items (code - name - colour - size × qty), no prices
  const askCs = () => openCs(cartText(cart.selected))
  const barBase = { position: desktop ? 'static' : 'fixed', left: 0, right: 0, bottom: 0, zIndex: 35, background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: desktop ? 'none' : 560, margin: '0 auto', boxSizing: 'border-box' }

  return (
    <div style={{ paddingBottom: desktop ? 40 : 220 }}>
      {!desktop && header}
      {desktop && <h1 style={{ margin: '32px 40px 0', fontSize: 28 }}>{t('cart.title', { n: cart.count })}</h1>}
      <div style={{ maxWidth: desktop ? 760 : 'none', margin: desktop ? '0 auto' : 0, padding: desktop ? '0 0' : 0 }}>
        {f.active && (
          <div style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {f.reached ? <b style={{ fontSize: 15, color: 'var(--color-success)' }}>{t('cart.free_reached')}</b>
              : <span style={{ fontSize: 15 }} dangerouslySetInnerHTML={{ __html: t('cart.free_remaining', { amount: money(f.remaining) }).replace(/<b>/g, '<b style="color:var(--color-primary-strong)">') }} />}
            <span style={{ height: 6, borderRadius: 3, background: 'var(--color-bg-soft)' }}><span style={{ display: 'block', width: `${f.pct}%`, height: '100%', borderRadius: 3, background: 'var(--color-primary)' }} /></span>
          </div>
        )}
        <section style={{ margin: '12px 16px 0', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 15 }}>
            <Box on={allOn} label={t('cart.select_all')} onClick={() => cart.toggleAll(!allOn)} />{t('cart.select_all')}
            <span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('cart.select_hint')}</span>
          </div>
          {cart.items.map((i) => (
            <div key={i.variantId} style={{ display: 'flex', gap: 12, padding: 14, borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ marginTop: 30 }}><Box on={i.selected !== false} label={i.name} onClick={() => cart.toggle(i.variantId)} /></span>
              <Link to={`/p/${i.productId}`} style={{ display: 'flex', flex: 'none' }}><img src={sized(img(i.image), 160)} alt={i.name} loading="lazy" onError={onImgError} style={{ flex: 'none', width: 76, height: 100, borderRadius: 12, objectFit: 'cover' }} /></Link>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Link to={`/p/${i.productId}`} style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--color-text)', textDecoration: 'none' }}>{i.name}</Link>
                <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{[i.color, i.size].filter(Boolean).join(' / ')}</span>
                <span style={{ flex: 1 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 15 }}>{money(i.price)}</b>
                  <span style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border-strong)', borderRadius: 20 }}>
                    <button type="button" aria-label={i.qty <= 1 ? t('cart.remove') : t('cart.dec')} onClick={() => (i.qty <= 1 ? cart.remove(i.variantId) : cart.setQty(i.variantId, i.qty - 1))} style={{ width: 36, height: 36, border: 'none', background: 'transparent', fontSize: 17, color: '#000000' }}>−</button>
                    <span style={{ width: 24, textAlign: 'center' }}>{i.qty}</span>
                    <button type="button" aria-label={t('cart.inc')} onClick={() => cart.setQty(i.variantId, i.qty + 1)} style={{ width: 36, height: 36, border: 'none', background: 'transparent', fontSize: 17, color: '#000000' }}>+</button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </section>
        <section style={{ margin: '16px 16px 0', padding: 16, borderRadius: 18, background: 'var(--color-primary-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 15 }}>{t('cart.two_ways')}</b>
          <span style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{t('cart.two_ways_text')}</span>
        </section>
      </div>

      <div style={{ ...barBase, padding: '12px 16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{t('cart.selected_total', { n: cart.selectedCount })}</span><b style={{ fontSize: 20 }}>{money(cart.selectedSubtotal)}</b></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button type="button" disabled={none} onClick={askCs}
            style={{ ...asBtn, ...{ minHeight: 52, padding: '6px 10px', boxSizing: 'border-box', borderRadius: 26, background: 'var(--color-text)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center', opacity: none ? 0.4 : 1 } }}><IconHeadset size={18} stroke="#FFFFFF" />{t('cart.ask_cs_order')}</button>
          <button type="button" disabled={none} onClick={() => navigate('/checkout')}
            style={{ minHeight: 52, padding: '6px 10px', boxSizing: 'border-box', borderRadius: 26, border: 'none', background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', ...(none ? { background: 'var(--color-border)', color: 'var(--color-disabled)', cursor: 'not-allowed' } : {}) }}>{t('cart.checkout')}</button>
        </div>
        {none && <span role="alert" style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('cart.none_selected')}</span>}
      </div>
    </div>
  )
}

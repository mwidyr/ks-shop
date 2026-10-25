import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { img, onImgError, sized, submitReturn, trackOrder, uploadPhoto } from '../lib/api'
import { money } from '../lib/format'
import { listLocalOrders } from '../lib/localOrders'
import { useSeo } from '../lib/seo'
import { useStore } from '../lib/store'
import { useMember } from '../lib/member'
import { orderQuestionText } from '../lib/wa'
import { normPhone } from '../lib/phone'
import { useCs } from '../lib/cs'
import { IconHeadset } from '../components/Icons'
import { asBtn, btnDark, ErrorState, PageHeader, Spinner } from '../components/ui'

const REASONS = ['size', 'color', 'defect', 'wrong', 'dislike']

export default function Return() {
  const { orderNo } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useStore()
  const { openCs } = useCs()
  const { signedIn } = useMember()
  const local = listLocalOrders().find((o) => o.orderNo === orderNo)
  const [o, setO] = useState(null)
  // "Send details to CS" / "Ask CS to submit": order number + customer + phone
  const askCs = () => openCs(orderQuestionText({ orderNo, name: o?.customer_name, phone: normPhone(local?.phone) }))
  const [state, setState] = useState('loading')
  const [sel, setSel] = useState([])
  const [kind, setKind] = useState('return')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('cvs_711')
  const [refund, setRefund] = useState('original')
  const [pickedMethod, setPickedMethod] = useState(false)
  const [err, setErr] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  useSeo({ title: t('ret.title'), noindex: true })

  useEffect(() => {
    if (!local) { navigate(`/orders/${orderNo}`, { replace: true }); return }
    trackOrder(orderNo, local.phone).then((d) => { setO(d); setState('ok'); if (d.items.length === 1) setSel([d.items[0].id]) }).catch(() => setState('error'))
  }, [orderNo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return <div><PageHeader title={t('ret.title')} /><Spinner label={t('common.loading')} /></div>
  if (state === 'error' || !o) return <div><PageHeader title={t('ret.title')} /><ErrorState onRetry={() => window.location.reload()} /></div>
  if (o.status !== 'delivered' && o.status !== 'shipped') return <div><PageHeader title={t('ret.title')} /><ErrorState title={t('ret.not_allowed')} /></div>

  async function submit() {
    if (!sel.length) { setErr(t('ret.need_item')); return }
    if (!reason) { setErr(t('ret.reason')); return }
    if (refund === 'credit' && !signedIn) { setErr(t('ret.credit_login')); return }
    setErr('')
    try {
      await submitReturn({ order_no: orderNo, phone: local.phone, kind, reason, note, item_ids: sel, return_method: method, refund_method: refund, photos })
      setState('done')
    } catch (e) { setErr(e.message) }
  }

  if (state === 'done') {
    return (
      <div><PageHeader title={t('ret.title')} to="/orders" />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{t('ret.done_title')}</h1>
          <span style={{ fontSize: 14, color: 'var(--color-text-2)' }}>{t('ret.done_text')}</span>
          <button type="button" onClick={askCs} style={{ ...asBtn, ...btnDark, minHeight: 48 }}><IconHeadset size={18} />{t('ret.send_cs')}</button>
        </div>
      </div>
    )
  }
  const needNote = reason === 'defect' || reason === 'wrong'
  const card = { margin: '12px 16px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }
  const h2 = { margin: 0, fontSize: 15, fontWeight: 700 }
  const head = (txt) => <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={h2}>{txt}</h2></div>
  const bar = (on) => ({ height: 4, borderRadius: 2, background: on ? 'var(--color-primary)' : 'var(--color-border)' })
  const logo = (name) => <span aria-label={name} style={{ flex: 'none', padding: '3px 6px', borderRadius: 6, background: 'var(--color-surface)', border: '1.5px dashed var(--color-border-strong)', color: 'var(--color-text)', fontSize: 11, fontWeight: 700 }}>{name}</span>
  const radioCard = (on) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: on ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: on ? 'var(--color-primary-soft)' : 'var(--color-surface)', textAlign: 'left', width: '100%', color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' })
  const dot = (on) => <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? 'var(--color-primary-strong)' : 'var(--color-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{on && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--color-primary)' }} />}</span>
  const sub = { fontSize: 12, color: 'var(--color-text-2)' }
  const slots = [0, 1, 2]
  return (
    <div style={{ paddingBottom: 110 }}>
      <PageHeader title={t('ret.title')} to="/orders" />
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', fontSize: 12, color: 'var(--color-text-2)' }}>
        {[[sel.length > 0, 's1'], [Boolean(reason), 's2'], [pickedMethod && sel.length > 0 && Boolean(reason), 's3']].map(([on, k]) => <span key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}><span style={bar(on)} />{t(`ret.${k}`)}</span>)}
      </div>
      <section style={card}>
        {head(t('ret.which'))}
        {o.items.map((i) => {
          const on = sel.includes(i.id)
          return (
            <button key={i.id} type="button" role="checkbox" aria-checked={on} onClick={() => setSel(on ? sel.filter((x) => x !== i.id) : [...sel, i.id])} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: on ? 'var(--color-primary)' : 'transparent', border: on ? 'none' : '2px solid var(--color-border-strong)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-primary)' }}>
                {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
              </span>
              <img src={sized(img(i.image), 120)} alt={i.name} onError={onImgError} style={{ width: 48, height: 64, borderRadius: 8, objectFit: 'cover' }} />
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{i.name}<br /><span style={{ color: 'var(--color-text-2)' }}>{[i.color, i.size].filter(Boolean).join(' / ')} × {i.qty}・{money(i.price)}</span></span>
            </button>
          )
        })}
      </section>
      <section style={card}>
        {head(t('ret.kind'))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {[['return', 'k_return'], ['exchange', 'k_exchange']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} style={{ height: 46, borderRadius: 12, border: kind === k ? '2px solid var(--color-primary-strong)' : '1px solid var(--color-border)', background: kind === k ? 'var(--color-primary-soft)' : 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: kind === k ? 700 : 400, color: 'var(--color-text)', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'content-box', padding: 0 }}>{t(`ret.${label}`)}</button>
          ))}
        </div>
      </section>
      <section style={card}>
        {head(t('ret.reason'))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REASONS.map((r) => <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} style={{ padding: '8px 12px', borderRadius: 18, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', ...(reason === r ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none' } : { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }) }}>{t(`ret.r_${r}`)}</button>)}
        </div>
        {needNote && <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('ret.note')} aria-label={t('ret.note')} style={{ borderRadius: 12, border: '1.5px solid var(--color-border-strong)', padding: 12, fontSize: 15, fontFamily: 'inherit' }} />}
        <div style={{ display: 'flex', gap: 8 }}>
          {slots.map((n) => {
            const u = photos[n]
            if (u) {
              return (
                <span key={u} style={{ position: 'relative', width: 72, height: 72 }}>
                  <img src={sized(img(u), 160)} alt="" onError={onImgError} style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
                  <button type="button" aria-label={t('photo.remove')} onClick={() => setPhotos(photos.filter((_, j) => j !== n))} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, border: '2px solid #fff', background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 12 }}>×</button>
                </span>
              )
            }
            return (
              <label key={n} style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed var(--color-border-strong)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-text-2)', cursor: 'pointer', boxSizing: 'content-box' }}>
                {uploading && n === photos.length ? t('photo.uploading') : <><b style={{ fontSize: 20 }}>+</b>{t('photo.add')}</>}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={async (e) => {
                  const f = e.target.files[0]; e.target.value = ''
                  if (!f) return
                  setUploading(true); setErr('')
                  try { setPhotos([...photos, await uploadPhoto(f)]) } catch { setErr(t('photo.failed')) } finally { setUploading(false) }
                }} />
              </label>
            )
          })}
        </div>
        <span style={sub}>{t('ret.defect_hint')}</span>
      </section>
      <section style={card}>
        {head(t('ret.how'))}
        {[['cvs_711', '7-ELEVEN', 'm_711'], ['cvs_familymart', 'FamilyMart', 'm_fami']].map(([k, name, tk]) => (
          <button key={k} type="button" onClick={() => { setMethod(k); setPickedMethod(true) }} style={radioCard(method === k)}>
            {dot(method === k)}{logo(name)}
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t(`ret.${tk}`)}</b><span style={sub}>{t(`ret.${tk}_t`)}</span></span>
          </button>
        ))}
      </section>
      <section style={card}>
        {head(t('ret.refund'))}
        <button type="button" onClick={() => setRefund('original')} style={radioCard(refund === 'original')}>
          {dot(refund === 'original')}
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('ret.f_orig')}</b><span style={sub}>{t('ret.f_orig_t')}</span></span>
        </button>
        <button type="button" onClick={() => setRefund('credit')} style={radioCard(refund === 'credit')}>
          {dot(refund === 'credit')}
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{t('ret.f_credit')}</b><span style={sub}>{t('ret.f_credit_t', { pct: settings.rewards?.refund_credit_bonus_pct ?? 5 })}</span></span>
        </button>
      </section>
      <div style={{ margin: '14px 16px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-2)' }}>{t('ret.help')}<button type="button" onClick={askCs} style={{ ...asBtn, fontWeight: 700, color: 'var(--color-primary-strong)', fontSize: 'inherit' }}>{t('ret.ask')}</button></div>
      {err && <div role="alert" style={{ margin: '10px 16px 0', color: 'var(--color-error)', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 84, padding: '14px 16px 18px', background: '#fff', borderTop: '1px solid var(--color-border)', zIndex: 10, maxWidth: 560, margin: '0 auto', boxSizing: 'border-box' }}>
        <button type="button" onClick={submit} style={{ height: 52, width: '100%', borderRadius: 12, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{t('ret.submit')}</button>
      </div>
    </div>
  )
}

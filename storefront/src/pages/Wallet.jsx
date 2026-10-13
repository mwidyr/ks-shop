import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getLedger } from '../lib/api'
import { shortDateTime, money } from '../lib/format'
import { useMember } from '../lib/member'
import { useSeo } from '../lib/seo'
import { Chip, EmptyState, PageHeader, Spinner } from '../components/ui'

// Wallet: shopping balance (NT$) + points and their history.
export default function Wallet() {
  const { t } = useTranslation()
  const { me, signedIn, ready } = useMember()
  const [kind, setKind] = useState('balance')
  const [rows, setRows] = useState(null)
  useSeo({ title: t('wallet.title'), noindex: true })
  useEffect(() => { if (signedIn) { setRows(null); getLedger(kind).then(setRows).catch(() => setRows([])) } }, [kind, signedIn])
  if (!ready) return <Spinner label={t('common.loading')} />
  if (!signedIn) return <Navigate to="/login" replace />
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('wallet.title')} to="/member" />
      <div style={{ margin: '16px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 16, borderRadius: 18, background: 'var(--color-primary-soft)' }}><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('wallet.balance')}</span><b className="serif" style={{ display: 'block', fontSize: 26 }}>{money(me.balance)}</b></div>
        <div style={{ padding: 16, borderRadius: 18, background: 'var(--color-bg-soft)' }}><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t('wallet.points')}</span><b className="serif" style={{ display: 'block', fontSize: 26 }}>{me.points}</b><span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>1 = {money(me.point_value)}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 8px' }}>
        <Chip active={kind === 'balance'} onClick={() => setKind('balance')}>{t('wallet.balance')}</Chip>
        <Chip active={kind === 'points'} onClick={() => setKind('points')}>{t('wallet.points')}</Chip>
      </div>
      {rows === null && <Spinner label={t('common.loading')} />}
      {rows && rows.length === 0 && <EmptyState title={t('wallet.empty')} />}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column' }}>
        {(rows || []).map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 14 }}>{t(`wallet.r_${r.reason}`, { defaultValue: r.reason })}</b><span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{shortDateTime(r.created_at)}{r.note ? `・${r.note}` : ''}</span></span>
            <b style={{ color: r.amount >= 0 ? 'var(--color-success)' : 'var(--color-text)' }}>{r.amount >= 0 ? '+' : '−'}{r.kind === 'balance' ? money(Math.abs(r.amount)) : Math.abs(r.amount)}</b>
          </div>
        ))}
      </div>
      <p style={{ padding: 16 }}><Link to="/member" style={{ fontSize: 13 }}>← {t('member.title')}</Link></p>
    </div>
  )
}

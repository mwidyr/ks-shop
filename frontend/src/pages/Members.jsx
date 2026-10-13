import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adjustMember, getMember, getRewardSettings, listMembers, saveRewardSettings, setMemberActive } from '../api/website'
import { btnCls, btnGhost, cardCls, inputCls } from '../components/website/Pickers'

const REWARD_FIELDS = ['welcome_balance', 'welcome_voucher_amount', 'welcome_voucher_min_order', 'welcome_voucher_days', 'referral_reward', 'points_per_100', 'point_value', 'birthday_discount_pct', 'refund_credit_bonus_pct']

export default function Members() {
  const { t } = useTranslation()
  const m = (k, o) => t(`page_members.${k}`, o)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [adj, setAdj] = useState({ kind: 'balance', amount: '', note: '' })
  const [rewards, setRewards] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = (text = q) => listMembers(text).then(setRows).catch(() => {})
  useEffect(() => { load(''); getRewardSettings().then(setRewards).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setTimeout(() => load(q), 250); return () => clearTimeout(id) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (id) => { setSel(id); setMsg(null); setDetail(await getMember(id)) }
  const fail = (e) => setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') })

  async function apply() {
    try { await adjustMember(sel, { kind: adj.kind, amount: Number(adj.amount), note: adj.note }); setAdj({ ...adj, amount: '', note: '' }); setMsg({ ok: true, text: m('adjusted') }); open(sel); load() } catch (e) { fail(e) }
  }
  async function saveRewards() {
    try { setRewards(await saveRewardSettings(Object.fromEntries(Object.entries(rewards).map(([k, v]) => [k, Number(v)])))); setMsg({ ok: true, text: m('saved') }) } catch (e) { fail(e) }
  }
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4 max-w-6xl">
      <div><h1 className="text-lg font-bold text-gray-800">{m('title')}</h1><p className="text-sm text-gray-500">{m('intro')}</p></div>
      {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <div className={`${cardCls} space-y-3 overflow-x-auto`}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={m('search')} className={inputCls} />
          {rows.length === 0 ? <p className="text-sm text-gray-500">{m('empty')}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{m('name')}</th><th>{m('contact')}</th><th className="text-right">{m('balance')}</th><th className="text-right">{m('points')}</th><th className="text-right">{m('orders')}</th><th>{m('status')}</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((x) => (
                  <tr key={x.id} onClick={() => open(x.id)} className={`cursor-pointer hover:bg-gray-50 ${sel === x.id ? 'bg-brand-50' : ''}`}>
                    <td className="py-2 font-medium">{x.name || '—'}<div className="text-[11px] text-gray-400">{x.referral_code}</div></td>
                    <td>{x.phone ? `+${x.phone}` : ''}<div className="text-xs text-gray-500">{x.email}</div></td>
                    <td className="text-right">NT${Math.round(x.balance).toLocaleString()}</td><td className="text-right">{Math.round(x.points)}</td><td className="text-right">{x.orders}</td>
                    <td><span className={`text-xs px-2 py-0.5 rounded ${x.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{x.is_active ? m('active') : m('inactive')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detail && (
          <div className={`${cardCls} space-y-4 lg:sticky lg:top-4`}>
            <div>
              <h2 className="font-bold text-gray-800">{detail.member.name || detail.member.phone || detail.member.email}</h2>
              <p className="text-xs text-gray-500">{detail.member.phone ? `+${detail.member.phone}` : ''} {detail.member.email || ''}</p>
              <p className="text-xs text-gray-500">{m('balance')}: <b>NT${Math.round(detail.member.balance).toLocaleString()}</b> · {m('points')}: <b>{detail.member.points}</b> · {m('referrals')}: <b>{detail.referrals}</b>{detail.referred_by ? ` · ${m('referred_by', { id: detail.referred_by })}` : ''}</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-700">{m('adjust')}</h3>
              <div className="flex gap-2">
                <select value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-2 text-sm"><option value="balance">{m('balance_kind')}</option><option value="points">{m('points_kind')}</option></select>
                <input type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} placeholder={m('amount')} className={inputCls} />
              </div>
              <input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder={m('note')} className={inputCls} />
              <button type="button" onClick={apply} disabled={!adj.amount || !adj.note.trim()} className={btnCls}>{m('apply')}</button>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-1">{m('history')}</h3>
              <ul className="divide-y text-sm max-h-72 overflow-auto">
                {detail.ledger.map((e, i) => (
                  <li key={i} className="py-1.5 flex justify-between gap-2"><span>{m(`reasons.${e.reason}`)}{e.note ? <span className="text-gray-400"> · {e.note}</span> : null}<div className="text-[11px] text-gray-400">{fmt(e.created_at)}</div></span><b className={e.amount >= 0 ? 'text-green-700' : ''}>{e.amount >= 0 ? '+' : ''}{e.kind === 'balance' ? `NT$${e.amount}` : e.amount}</b></li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={async () => { await setMemberActive(sel, !detail.is_active); open(sel); load() }} className={btnGhost}>{detail.is_active ? m('deactivate') : m('activate')}</button>
          </div>
        )}
      </div>

      {rewards && (
        <div className={`${cardCls} space-y-3`}>
          <div><h2 className="font-bold text-gray-800">{m('rewards')}</h2><p className="text-xs text-gray-500">{m('rewards_intro')}</p></div>
          <div className="grid sm:grid-cols-3 gap-3">
            {REWARD_FIELDS.map((k) => (
              <div key={k}><label className="text-xs text-gray-500">{m(k)}</label><input type="number" step="any" value={rewards[k]} onChange={(e) => setRewards({ ...rewards, [k]: e.target.value })} className={inputCls} /></div>
            ))}
          </div>
          <button type="button" onClick={saveRewards} className={btnCls}>{t('page_website.common.save')}</button>
        </div>
      )}
    </div>
  )
}

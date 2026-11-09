import { Fragment, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getPayroll, getPayrollSettings, saveBaseSalary, saveBonusSettings, savePayrollExtra, savePayrollTransferFee, setPayrollPaid,
} from '../api/employee'
import { useCanEdit } from '../context/AccessContext'
import { cardClasses } from '../components/Table'
import MonthSwitcher from '../components/MonthSwitcher'
import { currentMonth, fmtIDR, fmtRp, intlLocale, monthLabel, terbilang } from '../utils/employeeUi'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Opens a printable payslip in the standard Indonesian "slip gaji" layout (save as PDF from the print dialog).
function printPayslip(row, month, t, lang) {
  const d = row.details
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const period = `1-${lastDay} ${monthLabel(month, lang).replace(/\s*\d{4}$/, '')} ${y}`
  const now = new Date()
  const loc = intlLocale(lang)
  const longDate = now.toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const shortDate = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' })
  const items = [[t('page_employee.base_salary'), d.base_salary]]
  if (Number(d.unpaid_deduction)) items.push([t('page_employee.unpaid_deduction'), -d.unpaid_deduction])
  for (const [k, v] of [['attendance_bonus', d.attendance_bonus], ['qty_bonus', d.qty_bonus], ['gmv_bonus', d.gmv_bonus], ['daily_bonus', d.daily_bonus]]) {
    if (Number(v)) items.push([t(`page_employee.${k}`), v])
  }
  if (Number(d.extra)) items.push([`Extra${d.extra_note ? ` (${d.extra_note})` : ''}`, d.extra])
  const rows = items.map(([k, v], i) => `<tr><td class="n">${i + 1}</td><td>${esc(k)}</td><td class="r">${esc(fmtIDR(v))}</td></tr>`).join('')
  const words = String(lang || '').startsWith('id') ? `<i>${esc(t('page_employee.payslip_in_words'))} : ${esc(terbilang(d.final_salary))}</i>` : ''
  const title = `${t('page_employee.payslip_title')} ${row.full_name || row.nickname} ${month}`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:13px;margin:0}
.box{border:2px solid #000;max-width:720px;margin:0 auto}.head{height:110px;border-bottom:2px solid #000}.body{padding:14px 22px 26px}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #000;padding-bottom:3px}
.top h1{font-size:19px;margin:0 0 0 70px;letter-spacing:.3px}.meta td{padding:1px 0}.meta td:first-child{padding-right:30px}
.info{display:flex;justify-content:space-between;margin:12px 0 14px}.info td{padding:1px 14px 1px 0}
table.items{width:100%;border-collapse:collapse}table.items th{text-align:left;border-bottom:1.5px solid #000;padding:2px 4px}
table.items td{padding:2px 4px}.n{width:30px}.r{text-align:right}table.items th.r{text-align:right}
.sub td{border-top:1.5px solid #000;font-weight:bold}.foot{display:flex;justify-content:space-between;margin-top:10px;border-top:1.5px solid #000;padding-top:6px}
.tot{font-weight:bold;white-space:nowrap}.tot u{margin-right:30px}.sign{display:flex;justify-content:space-between;margin-top:26px}
.sign .l{padding-left:60px}.sign .rr{text-align:center;width:240px}.sign .line{margin-top:64px;border-top:1px solid #000;padding-top:3px}</style></head>
<body><div class="box"><div class="head"></div><div class="body">
<div class="top"><h1>${esc(t('page_employee.payslip_title').toUpperCase())}</h1>
<table class="meta"><tr><td>${esc(t('page_employee.payslip_date'))}</td><td>: ${esc(shortDate)}</td></tr>
<tr><td>${esc(t('page_employee.payslip_ref'))}</td><td>: SG/${esc(month.replace('-', ''))}/${esc(row.emp_code)}</td></tr>
<tr><td>${esc(t('page_employee.payslip_period'))}</td><td>: ${esc(period)}</td></tr></table></div>
<div class="info"><table><tr><td>${esc(t('page_employee.payslip_name'))}</td><td>: ${esc(row.full_name || row.nickname)}</td></tr>
<tr><td>${esc(t('page_employee.payslip_position'))}</td><td>: ${esc(row.position || '-')}</td></tr></table>
<table><tr><td>${esc(t('page_employee.payslip_emp_code'))}</td><td>: ${esc(row.emp_code)}</td></tr>
<tr><td>${esc(t('page_employee.payslip_phone'))}</td><td>: ${esc(row.whatsapp || '-')}</td></tr></table></div>
<table class="items"><tr><th class="n">${esc(t('page_employee.payslip_no'))}</th><th>${esc(t('page_employee.payslip_desc'))}</th><th class="r">${esc(t('page_employee.payslip_amount'))}</th></tr>${rows}
<tr class="sub"><td></td><td></td><td class="r">${esc(fmtIDR(d.final_salary))}</td></tr></table>
<div class="foot"><div>${words}</div><div class="tot"><u>${esc(t('page_employee.payslip_total'))}</u> ${esc(fmtIDR(d.final_salary))}</div></div>
<div class="sign"><div class="l"><div>${esc(t('page_employee.payslip_receiver'))}</div></div>
<div class="rr"><div>Jakarta, ${esc(longDate)}</div><div>${esc(t('page_employee.payslip_signed'))}</div><div class="line">${esc(t('page_employee.payslip_management'))}</div></div></div>
</div></div><script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function Detail({ row, month, canEdit, onChanged }) {
  const { t, i18n } = useTranslation()
  const d = row.details
  const [extra, setExtra] = useState(String(d.extra || 0))
  const [note, setNote] = useState(d.extra_note || '')
  const [err, setErr] = useState('')
  useEffect(() => { setExtra(String(d.extra || 0)); setNote(d.extra_note || '') }, [d.extra, d.extra_note])
  const lines = [
    ['base_salary', fmtIDR(d.base_salary)], ['work_days', d.work_days], ['off_days', d.off_days], ['unpaid_days', d.unpaid_days], ['leave_days', d.leave_days],
    ['unpaid_deduction', fmtIDR(d.unpaid_deduction)], ['attendance_bonus', fmtIDR(d.attendance_bonus)], ['qty_bonus', fmtIDR(d.qty_bonus)],
    ['gmv_bonus', fmtIDR(d.gmv_bonus)], ['daily_bonus', fmtIDR(d.daily_bonus)],
  ]
  async function saveExtra() {
    if (String(d.extra || 0) === extra && (d.extra_note || '') === note) return
    setErr('')
    try { await savePayrollExtra({ employee_id: row.employee_id, month, extra: Number(extra) || 0, note }); onChanged() } catch (e) { setErr(e.response?.data?.error || t('page_employee.save_error')) }
  }
  return (
    <div className="p-4 space-y-2 bg-[var(--table-header-bg)] text-[var(--text-primary)]">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-bold text-[var(--text-primary)]">{row.nickname} — {t('page_employee.salary_details')}</h3><p className="text-xs text-[var(--text-secondary)]">{month}{row.finalized ? ` · ${t('page_employee.finalized')}` : ''}</p></div>
        <button type="button" onClick={() => printPayslip(row, month, t, i18n.language)} className="border border-gray-300 bg-[var(--table-card-bg)] text-[var(--text-primary)] text-sm font-semibold px-3 py-1.5 rounded-lg">{t('page_employee.copy_payslip')}</button>
      </div>
      <dl className="divide-y divide-[var(--table-divider)] text-sm max-w-xl">
        {lines.map(([k, v]) => <div key={k} className="flex justify-between py-1.5"><dt className="text-[var(--text-secondary)]">{t(`page_employee.${k}`)}</dt><dd>{v}</dd></div>)}
        <div className="flex justify-between items-center py-1.5"><dt className="text-[var(--text-secondary)]">Extra</dt>
          <dd><input type="number" value={extra} disabled={!canEdit || row.paid} onChange={(e) => setExtra(e.target.value)} onBlur={saveExtra} className={`${inputCls} w-40 text-right`} /></dd></div>
        <div className="flex justify-between py-1.5 font-bold"><dt>{t('page_employee.final_salary')}</dt><dd>{fmtRp(d.final_salary)}</dd></div>
      </dl>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] max-w-xl">{t('page_employee.extra_notes')}
        <textarea value={note} disabled={!canEdit || row.paid} onChange={(e) => setNote(e.target.value)} onBlur={saveExtra} rows={2} className={`${inputCls} w-full mt-1`} /></label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <p className="text-sm text-[var(--text-secondary)]">{t('page_employee.payment_status')}: {row.paid ? `${t('page_employee.paid_done')} · ${new Date(row.paid_at).toLocaleString()} · ${row.paid_by || ''}` : t('page_employee.pending')}</p>
    </div>
  )
}

const tierInput = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white w-full'

// Payroll Settings: A. Salary Settings (base salary per employee, carried forward) and B. Bonus Formula Settings (the four rules).
function SettingsModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('salary')
  const [data, setData] = useState(null)
  const [salaries, setSalaries] = useState({})
  const [bonus, setBonus] = useState(null)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { getPayrollSettings().then((d) => { setData(d); setBonus(d.bonus); setSalaries(Object.fromEntries(d.salaries.map((s) => [s.employee_id, String(s.base_salary)]))) }) }, [])

  const num = (v) => (v === '' || v == null ? 0 : Number(v))
  async function saveSalary(s) {
    if (Number(salaries[s.employee_id]) === s.base_salary) return
    setMsg('')
    try { await saveBaseSalary({ employee_id: s.employee_id, base_salary: num(salaries[s.employee_id]) }); s.base_salary = num(salaries[s.employee_id]); setMsg(t('page_employee.saved')); onSaved() } catch (e) { setMsg(e.response?.data?.error || t('page_employee.save_error')) }
  }
  async function saveBonus() {
    setMsg('')
    try {
      const clean = {
        attendance_amount: num(bonus.attendance_amount),
        qty_tiers: bonus.qty_tiers.map((x) => ({ min: num(x.min), max: x.max === '' || x.max == null ? null : num(x.max), rate: num(x.rate) })),
        gmv_tiers: bonus.gmv_tiers.map((x) => ({ min: num(x.min), bonus: num(x.bonus) })),
        daily: { accumulate: Boolean(bonus.daily.accumulate), tiers: bonus.daily.tiers.map((x) => ({ qty: num(x.qty), bonus: num(x.bonus) })) },
      }
      setBonus(await saveBonusSettings(clean))
      setMsg(t('page_employee.saved'))
      onSaved()
    } catch (e) { setMsg(e.response?.data?.error || t('page_employee.save_error')) }
  }
  const patch = (key, i, field, value) => setBonus((b) => ({ ...b, [key]: b[key].map((x, j) => (j === i ? { ...x, [field]: value } : x)) }))
  const patchDaily = (i, field, value) => setBonus((b) => ({ ...b, daily: { ...b.daily, tiers: b.daily.tiers.map((x, j) => (j === i ? { ...x, [field]: value } : x)) } }))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--table-card-bg)] rounded-2xl w-full max-w-3xl p-5 space-y-4 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg text-[var(--text-primary)]">{t('page_employee.payroll_settings')}</h2><button type="button" onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button></div>
        <div className="flex gap-2">
          {[['salary', t('page_employee.salary_settings')], ['bonus', t('page_employee.bonus_settings')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setMsg('') }} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${tab === k ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
          ))}
        </div>
        {!data ? <p className="text-center text-gray-400 py-6">{t('common.loading')}</p> : tab === 'salary' ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.salary_hint', { month: data.effective_month })}</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page_employee.search_salary_ph')} className={`${inputCls} w-full`} />
            {data.salaries.filter((s) => [s.nickname, s.emp_code, s.location].some((v) => String(v || '').toLowerCase().includes(search.trim().toLowerCase()))).map((s) => (
              <div key={s.employee_id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2">
                <div className="flex-1"><p className="font-semibold text-sm text-[var(--text-primary)]">{s.nickname}</p><p className="text-[11px] text-[var(--text-secondary)]">{s.emp_code} · {s.location}</p></div>
                <input type="number" min="0" value={salaries[s.employee_id] ?? ''} onChange={(e) => setSalaries((m) => ({ ...m, [s.employee_id]: e.target.value }))} onBlur={() => saveSalary(s)} className={`${inputCls} w-44 text-right`} />
              </div>
            ))}
            {data.salaries.length === 0 && <p className="text-center text-gray-400 py-4">{t('page_employee.none')}</p>}
            {data.salaries.length > 0 && !data.salaries.some((s) => [s.nickname, s.emp_code, s.location].some((v) => String(v || '').toLowerCase().includes(search.trim().toLowerCase()))) && <p className="text-center text-gray-400 py-4">{t('page_employee.no_match')}</p>}
          </div>
        ) : bonus && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="font-semibold">1. {t('page_employee.attendance_bonus')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.attendance_bonus_hint')}</p>
              <input type="number" min="0" value={bonus.attendance_amount} onChange={(e) => setBonus({ ...bonus, attendance_amount: e.target.value })} className={`${inputCls} w-56`} />
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">2. {t('page_employee.qty_bonus')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.qty_bonus_hint')}</p>
              {bonus.qty_tiers.map((x, i) => (
                <div key={i} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2">
                  <input type="number" min="0" value={x.min} onChange={(e) => patch('qty_tiers', i, 'min', e.target.value)} placeholder={t('page_employee.min_qty')} className={tierInput} />
                  <input type="number" min="0" value={x.max ?? ''} onChange={(e) => patch('qty_tiers', i, 'max', e.target.value)} placeholder={t('page_employee.max_qty')} className={tierInput} />
                  <input type="number" min="0" value={x.rate} onChange={(e) => patch('qty_tiers', i, 'rate', e.target.value)} placeholder={t('page_employee.rate_per_item')} className={tierInput} />
                  <button type="button" onClick={() => setBonus((b) => ({ ...b, qty_tiers: b.qty_tiers.filter((_, j) => j !== i) }))} className="text-red-600 px-2">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setBonus((b) => ({ ...b, qty_tiers: [...b.qty_tiers, { min: '', max: null, rate: '' }] }))} className="text-sm font-semibold text-brand-600">+ {t('page_employee.add_tier')}</button>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">3. {t('page_employee.gmv_bonus')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.gmv_bonus_hint')}</p>
              {bonus.gmv_tiers.map((x, i) => (
                <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                  <input type="number" min="0" value={x.min} onChange={(e) => patch('gmv_tiers', i, 'min', e.target.value)} placeholder={t('page_employee.gmv_threshold')} className={tierInput} />
                  <input type="number" min="0" value={x.bonus} onChange={(e) => patch('gmv_tiers', i, 'bonus', e.target.value)} placeholder={t('page_employee.bonus_idr')} className={tierInput} />
                  <button type="button" onClick={() => setBonus((b) => ({ ...b, gmv_tiers: b.gmv_tiers.filter((_, j) => j !== i) }))} className="text-red-600 px-2">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setBonus((b) => ({ ...b, gmv_tiers: [...b.gmv_tiers, { min: '', bonus: '' }] }))} className="text-sm font-semibold text-brand-600">+ {t('page_employee.add_tier')}</button>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">4. {t('page_employee.daily_bonus')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.daily_bonus_hint')}</p>
              {bonus.daily.tiers.map((x, i) => (
                <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                  <input type="number" min="0" value={x.qty} onChange={(e) => patchDaily(i, 'qty', e.target.value)} placeholder={t('page_employee.daily_qty')} className={tierInput} />
                  <input type="number" min="0" value={x.bonus} onChange={(e) => patchDaily(i, 'bonus', e.target.value)} placeholder={t('page_employee.bonus_idr')} className={tierInput} />
                  <button type="button" onClick={() => setBonus((b) => ({ ...b, daily: { ...b.daily, tiers: b.daily.tiers.filter((_, j) => j !== i) } }))} className="text-red-600 px-2">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setBonus((b) => ({ ...b, daily: { ...b.daily, tiers: [...b.daily.tiers, { qty: '', bonus: '' }] } }))} className="text-sm font-semibold text-brand-600">+ {t('page_employee.add_tier')}</button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bonus.daily.accumulate} onChange={(e) => setBonus((b) => ({ ...b, daily: { ...b.daily, accumulate: e.target.checked } }))} />{t('page_employee.daily_accumulate')}</label>
            </section>
            <div className="flex justify-end"><button type="button" onClick={saveBonus} className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_employee.save_bonus_rules')}</button></div>
          </div>
        )}
        {msg && <p className="text-sm text-[var(--text-secondary)]">{msg}</p>}
      </div>
    </div>
  )
}

export default function Payroll() {
  const { t } = useTranslation()
  const canEdit = useCanEdit()
  const [month, setMonth] = useState(currentMonth())
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [fee, setFee] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => getPayroll({ month, location_id: locationId }).then((d) => { setData(d); setFee(String(d.summary.transfer_fee || 0)) }).catch(() => setError('load')), [month, locationId])
  useEffect(() => { setData(null); load() }, [load])

  async function togglePaid(row) {
    setError('')
    try { await setPayrollPaid({ employee_id: row.employee_id, month, paid: !row.paid }); load() } catch (e) { setError(e.response?.data?.error || t('page_employee.save_error')) }
  }
  async function saveFee() {
    if (Number(fee) === data.summary.transfer_fee) return
    setError('')
    try { await savePayrollTransferFee({ month, amount: Number(fee) || 0 }); load() } catch (e) { setError(e.response?.data?.error || t('page_employee.save_error')) }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-xl font-bold text-[var(--text-primary)]">{t('nav.items.payroll')}</h1><p className="text-sm text-[var(--text-secondary)]">Ralulu Admin / EMPLOYEE</p></div>
        <button type="button" onClick={() => setSettingsOpen(true)} className="border border-gray-300 text-sm font-semibold px-4 py-2 rounded-full">⚙ {t('page_employee.settings')} ▾</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('page_employee.month')}</span><MonthSwitcher value={month} onChange={setMonth} /></div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.location')}
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} w-full mt-1`}><option value="">{t('page_employee.all_locations')}</option>{(data?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      </div>
      {error && <p className="text-sm text-red-600">{error === 'load' ? t('page_employee.load_error') : error}</p>}

      {!data ? <div className={`${cardClasses} p-8 text-center text-gray-400`}>{t('common.loading')}</div> : (
        <>
          <div className={`${cardClasses} p-5 space-y-3`}>
            <div className="flex justify-between"><h2 className="font-bold text-[var(--text-primary)]">{t('page_employee.payroll_summary')}</h2><span className="text-xs text-[var(--text-secondary)]">IDR · {t('page_employee.all_locations')}</span></div>
            <div className="flex justify-between items-center"><span>{t('page_employee.total_salaries')}</span><span className="text-xl font-bold">{fmtRp(data.summary.total_salaries)}</span></div>
            <div className="flex justify-between items-center gap-3 border-t border-[var(--table-divider)] pt-3">
              <div><p>{t('page_employee.transfer_fee')}</p><p className="text-xs text-[var(--text-secondary)]">{t('page_employee.transfer_fee_hint')}</p></div>
              <input type="number" min="0" value={fee} disabled={!canEdit} onChange={(e) => setFee(e.target.value)} onBlur={saveFee} className={`${inputCls} w-40 text-right`} />
            </div>
            <div className="flex justify-between items-center border-t border-[var(--table-divider)] pt-3"><div><p className="font-bold">{t('page_employee.grand_total')}</p><p className="text-xs text-[var(--text-secondary)]">{t('page_employee.grand_total_hint')}</p></div><span className="text-xl font-bold">{fmtRp(data.summary.grand_total)}</span></div>
          </div>

          <p className="text-xs text-[var(--text-secondary)]">{t('page_employee.payroll_counts', { employees: data.counts.employees, paid: data.counts.paid, pending: data.counts.pending })} · IDR</p>
          <div className={`${cardClasses} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
                <th className="p-3">{t('page_employee.employee')}</th><th className="p-3 text-right">{t('page_employee.base_salary')}</th><th className="p-3 text-right">Work</th><th className="p-3 text-right">Off</th>
                <th className="p-3 text-right">Bonus</th><th className="p-3 text-right">{t('page_employee.final_salary')}</th><th className="p-3 text-center">Payroll</th><th className="p-3 w-6" />
              </tr></thead>
              <tbody>
                {data.rows.map((row) => (
                  <Fragment key={row.employee_id}>
                    <tr className="border-t border-[var(--table-divider)] hover:bg-[var(--table-row-hover)]">
                      <td className="p-3 cursor-pointer" onClick={() => setExpanded(expanded === row.employee_id ? null : row.employee_id)}><p className="font-semibold text-[var(--text-primary)]">{row.nickname}</p><p className="text-[11px] text-[var(--text-secondary)]">{row.location}</p></td>
                      <td className="p-3 text-right">{fmtIDR(row.details.base_salary)}</td><td className="p-3 text-right">{row.details.work_days}</td><td className="p-3 text-right">{row.details.off_days}</td>
                      <td className="p-3 text-right">{fmtIDR(row.details.bonus)}</td><td className="p-3 text-right font-semibold">{fmtIDR(row.details.final_salary)}</td>
                      <td className="p-3 text-center"><input type="checkbox" checked={row.paid} disabled={!canEdit} onChange={() => togglePaid(row)} className="h-5 w-5 accent-brand-600" title={row.paid ? `${row.paid_by || ''}` : ''} /></td>
                      <td className="p-3 text-gray-400 cursor-pointer" onClick={() => setExpanded(expanded === row.employee_id ? null : row.employee_id)}>{expanded === row.employee_id ? '▴' : '▾'}</td>
                    </tr>
                    {expanded === row.employee_id && <tr><td colSpan={8} className="p-0"><Detail row={row} month={month} canEdit={canEdit} onChanged={load} /></td></tr>}
                  </Fragment>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-400">{t('page_employee.none')}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBonusRanking } from '../api/employee'
import MonthSwitcher from '../components/MonthSwitcher'
import { cardClasses } from '../components/Table'
import { currentMonth, fmtIDR } from '../utils/employeeUi'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'
const MEDALS = { 1: ['🥇', 'gold'], 2: ['🥈', 'silver'], 3: ['🥉', 'bronze'] }

// Hosts only (employees linked to a Host): the bonus breakdown Payroll uses - QTY, GMV and Daily Bonus - and their Total,
// highest first. Only Total Bonus is bold; amounts are IDR with thousand separators and no decimals.
export default function BonusRanking() {
  const { t } = useTranslation()
  const [month, setMonth] = useState(currentMonth())
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null)
    getBonusRanking({ month, location_id: locationId }).then(setData).catch(() => setError(true))
  }, [month, locationId])

  const num = 'py-2.5 pl-3 pr-4 text-right tabular-nums whitespace-nowrap'
  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-4">
      <div><h1 className="text-xl font-bold text-[var(--text-primary)]">{t('nav.items.bonus_ranking')}</h1><p className="text-sm text-[var(--text-secondary)]">Ralulu Admin / EMPLOYEE</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher value={month} onChange={setMonth} />
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
          <option value="">{t('page_employee.all_locations')}</option>{(data?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{t('page_employee.load_error')}</p>}
      <div className={`${cardClasses} overflow-x-auto`}>
        <table className="w-full text-sm text-[var(--text-primary)]">
          <thead><tr className="text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
            <th className="py-2.5 pl-4 pr-2 text-center w-14">#</th><th className="py-2.5 px-2 text-left">Host</th><th className="py-2.5 px-2 text-left">{t('page_employee.location')}</th>
            <th className={`${num} font-semibold`}>{t('page_employee.qty_bonus')}</th><th className={`${num} font-semibold`}>{t('page_employee.gmv_bonus')}</th>
            <th className={`${num} font-semibold`}>{t('page_employee.daily_bonus')}</th><th className={`${num} font-semibold`}>{t('page_employee.total_bonus')}</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--table-divider)]">
            {(data?.rows || []).map((r) => (
              <tr key={r.employee_id}>
                <td className="py-2.5 pl-4 pr-2 text-center" title={MEDALS[r.rank]?.[1]}>{MEDALS[r.rank] ? <span className="text-lg leading-none">{MEDALS[r.rank][0]}</span> : r.rank}</td>
                <td className="py-2.5 px-2">{r.host}</td><td className="py-2.5 px-2 text-[var(--text-secondary)]">{r.location}</td>
                <td className={num}>{fmtIDR(r.qty_bonus)}</td><td className={num}>{fmtIDR(r.gmv_bonus)}</td><td className={num}>{fmtIDR(r.daily_bonus)}</td>
                <td className={`${num} font-bold`}>{fmtIDR(r.total_bonus)}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-[var(--text-secondary)]">{t('page_employee.no_hosts')}</td></tr>}
            {!data && !error && <tr><td colSpan={7} className="p-6 text-center text-[var(--text-secondary)]">{t('common.loading')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

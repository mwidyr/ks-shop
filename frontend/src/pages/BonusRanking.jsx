import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBonusRanking } from '../api/employee'
import { cardClasses } from '../components/Table'
import { currentMonth, fmtIDR } from '../utils/employeeUi'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'

// Hosts only (employees linked to a Host): monthly QTY, GMV and Total Bonus = QTY + GMV + Daily Bonus, highest first.
// Base salary, Attendance Bonus and Extra are not shown; no currency labels.
export default function BonusRanking() {
  const { t } = useTranslation()
  const [month, setMonth] = useState(currentMonth())
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    getBonusRanking({ month, location_id: locationId }).then(setData).catch(() => setError('load'))
  }, [month, locationId])

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-4">
      <div><h1 className="text-xl font-bold text-[var(--text-primary)]">{t('nav.items.bonus_ranking')}</h1><p className="text-sm text-[var(--text-secondary)]">Ralulu Admin / EMPLOYEE</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.month')}
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('page_employee.location')}
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} w-full mt-1`}><option value="">{t('page_employee.all_locations')}</option>{(data?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      </div>
      {error && <p className="text-sm text-red-600">{t('page_employee.load_error')}</p>}
      <div className={`${cardClasses} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
            <th className="p-3">#</th><th className="p-3">Host</th><th className="p-3">{t('page_employee.location')}</th><th className="p-3 text-right">QTY</th><th className="p-3 text-right">GMV</th><th className="p-3 text-right">{t('page_employee.total_bonus')}</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--table-divider)]">
            {(data?.rows || []).map((r) => (
              <tr key={r.employee_id}><td className="p-3">{r.rank}</td><td className="p-3">{r.host}</td><td className="p-3">{r.location}</td>
                <td className="p-3 text-right">{fmtIDR(r.qty)}</td><td className="p-3 text-right">{fmtIDR(r.gmv)}</td><td className="p-3 text-right font-bold">{fmtIDR(r.total_bonus)}</td></tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('page_employee.no_hosts')}</td></tr>}
            {!data && <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('common.loading')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

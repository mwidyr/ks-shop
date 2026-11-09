import { useTranslation } from 'react-i18next'
import { monthLabel, shiftMonth } from '../utils/employeeUi'

// "‹ November 2026 ›": the month picker of Shift Schedule, also used by Payroll and Bonus Ranking (only a month is needed).
export default function MonthSwitcher({ value, onChange }) {
  const { i18n } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} className="border border-gray-300 rounded-full w-9 h-9 text-[var(--text-primary)]">‹</button>
      <span className="font-semibold text-[var(--text-primary)] min-w-[9rem] text-center">{monthLabel(value, i18n?.language)}</span>
      <button type="button" onClick={() => onChange(shiftMonth(value, 1))} className="border border-gray-300 rounded-full w-9 h-9 text-[var(--text-primary)]">›</button>
    </div>
  )
}

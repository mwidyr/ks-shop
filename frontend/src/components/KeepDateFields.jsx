import { useTranslation } from 'react-i18next'
import { keepDates } from '../utils/keepDate'

// Keep-order date: pick what the date means (shipping vs expected delivery) and show the dates
// the Shipping Workbench will use. Controlled; the parent decides when to save.
export default function KeepDateFields({ date, type, onDate, onType, onCommit, disabled }) {
  const { t } = useTranslation()
  const calc = keepDates(date, type)
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={type}
          onChange={(e) => { onType(e.target.value); onCommit?.(date, e.target.value) }}
          disabled={disabled}
          aria-label={t('keep_date.type_label')}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="shipping">{t('keep_date.type_shipping')}</option>
          <option value="delivery">{t('keep_date.type_delivery')}</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          onBlur={(e) => onCommit?.(e.target.value, type)}
          disabled={disabled}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      {calc && (
        <p className="text-xs text-gray-500 mt-1" data-testid="keep-calc">
          {type === 'delivery' && <>{t('keep_date.ship_date', { date: calc.ship })} · </>}
          {t('keep_date.export_from', { date: calc.exportFrom })}
        </p>
      )}
      <p className="text-[10px] text-gray-400 mt-0.5">{t(type === 'delivery' ? 'keep_date.hint_delivery' : 'keep_date.hint_shipping')}</p>
    </div>
  )
}

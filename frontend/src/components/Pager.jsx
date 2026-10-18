import { useTranslation } from 'react-i18next'

// "Page 2 of 5 (120)" with Previous / Next, for the server-paged lists. `total` is the number of
// matching rows, `size` the page size, `page` the current (1-based) page.
export default function Pager({ page, size, total, onPage, className = '' }) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / size))
  if (total <= size) return null
  return (
    <div className={`flex items-center justify-between mt-4 text-sm text-[var(--text-secondary)] ${className}`}>
      <span>{t('page_orders.pagination_info', { page, totalPages, total })}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-[var(--table-divider)] disabled:opacity-40">{t('page_orders.prev')}</button>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-[var(--table-divider)] disabled:opacity-40">{t('page_orders.next')}</button>
      </div>
    </div>
  )
}

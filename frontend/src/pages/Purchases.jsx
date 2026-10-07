import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { listPurchases } from '../api/purchases'
import { formatCNY } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'
import { IconChevronDown } from '../components/icons'
import { useMasterData } from '../context/MasterDataContext'

export const purchaseStatusColors = {
  ordered: 'bg-yellow-100 text-yellow-700',
  pending_arrival: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const statuses = ['ordered', 'pending_arrival', 'partially_received', 'received', 'cancelled']

// "Supplier Orders" (the former Purchases page): one row per individual supplier PO. A row
// expands (like a supplier section in Purchase Requisitions) to show each product with its
// delivery batches; opening the order itself goes to the full detail page.
export default function Purchases() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { translateColor } = useMasterData()
  const [purchases, setPurchases] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())

  // Search is debounced; status and date apply immediately, and all three combine server-side.
  useEffect(() => {
    const timer = setTimeout(() => {
      listPurchases({ status: statusFilter, search: search.trim(), date }).then(setPurchases)
    }, 250)
    return () => clearTimeout(timer)
  }, [statusFilter, search, date])

  function toggle(id) {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('page_purchases.search_placeholder')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-72"
          />
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            title={t('page_purchases.date_filter_label')} aria-label={t('page_purchases.date_filter_label')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          {(search || date) && (
            <button onClick={() => { setSearch(''); setDate('') }} className="text-xs text-gray-500 underline">{t('page_purchases.clear_filters')}</button>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/purchases/history" className="border border-gray-300 text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50">
            {t('page_purchases.history_link')}
          </Link>
          <Link to="/purchase-requisitions" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {t('page_purchases.create_button')}
          </Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {['', ...statuses].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
          >
            {s === '' ? t('page_purchases.filter_all') : t(`page_purchases.status_${s}`)}
          </button>
        ))}
      </div>

      <div className={`${cardClasses} overflow-x-auto`}>
        <table className={tableClasses}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-3.5 w-8"></th>
              <th className="p-3.5">{t('page_purchases.th_po_number')}</th>
              <th className="p-3.5">{t('page_purchases.th_source_pr')}</th>
              <th className="p-3.5">{t('page_purchases.th_supplier')}</th>
              <th className="p-3.5">{t('page_purchases.th_date')}</th>
              <th className="p-3.5">{t('page_purchases.th_expected_arrival')}</th>
              <th className="p-3.5">{t('page_purchases.th_items')}</th>
              <th className="p-3.5">{t('page_purchases.th_total_cost')}</th>
              <th className="p-3.5">{t('page_purchases.th_status')}</th>
              <th className="p-3.5"></th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {purchases.map((p) => {
              const open = expanded.has(p.id)
              return (
                <Fragment key={p.id}>
                  <tr className={`${rowClasses} cursor-pointer`} onClick={() => toggle(p.id)}>
                    <td className="p-3.5">
                      <IconChevronDown width={16} height={16} className={`text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} />
                    </td>
                    <td className="p-3.5 font-mono text-xs text-brand-600">{p.po_number}</td>
                    <td className="p-3.5 font-mono text-xs text-[var(--text-secondary)]">{p.source_pr_no || '-'}</td>
                    <td className="p-3.5 font-medium text-[var(--text-primary)]">{p.supplier_name}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{p.order_date}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{p.expected_arrival_date || '-'}</td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{t('page_purchases.item_count_summary', { count: p.item_count, qty: p.total_qty })}</td>
                    <td className="p-3.5 text-[var(--text-primary)] font-semibold">{formatCNY(p.total_cost)}</td>
                    <td className="p-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${purchaseStatusColors[p.status]}`}>{t(`page_purchases.status_${p.status}`)}</span>
                    </td>
                    <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => navigate(`/purchases/${p.id}`)} className="text-brand-600 text-xs font-semibold hover:underline">{t('page_purchases.detail_link')}</button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={10} className="bg-[var(--table-header-bg)] px-4 py-3">
                        <ul className="space-y-3">
                          {p.items.map((it) => (
                            <li key={it.id} className="text-sm">
                              <p className="text-[var(--text-primary)]">
                                <span className="font-mono text-xs text-brand-600">{it.product_sku}</span> — {it.product_name} — {translateColor(it.color)}/{it.size}
                                {' '}<span className="text-[var(--text-secondary)]">— {t('page_purchases.order_qty_label', { qty: it.qty })}</span>
                              </p>
                              <ul className="mt-1 ml-4 space-y-0.5 text-[var(--text-secondary)]">
                                {it.batches.map((b) => (
                                  <li key={b.id}>
                                    {t('page_purchases.batch_line', { n: b.batch_no, qty: b.planned_qty })}
                                    {b.is_received && <span className="text-green-600 font-semibold"> · {t('page_purchases.batch_received_suffix', { qty: b.received_qty })} ✓</span>}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {purchases.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-[var(--text-secondary)]">{t('page_purchases.empty_state')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getPurchaseHistory } from '../api/purchases'
import { listSuppliers } from '../api/suppliers'
import DateRangePicker from '../components/DateRangePicker'
import { formatCurrency } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'

function fmtPct(n) { return n == null ? '—' : `${n.toFixed(1)}%` }

export default function PurchaseHistory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [productSku, setProductSku] = useState('')
  const [range, setRange] = useState(null)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { listSuppliers(true).then(setSuppliers) }, [])

  useEffect(() => {
    setLoading(true)
    getPurchaseHistory({ supplierId: supplierId || undefined, productSku: productSku || undefined, from: range?.from, to: range?.to })
      .then((res) => { setRows(res.rows); setSummary(res.summary); setLoading(false) })
  }, [supplierId, productSku, range])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <button onClick={() => navigate('/purchases')} className="text-sm text-gray-500 hover:text-gray-800">
        ← {t('page_purchase_history.back_button')}
      </button>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_purchase_history.all_suppliers')}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input value={productSku} onChange={(e) => setProductSku(e.target.value)} placeholder={t('page_purchase_history.product_code_placeholder')} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_purchase_history.total_amount')}</p><p className="text-lg font-bold text-gray-800">{formatCurrency(summary.total_purchase_amount)}</p></div>
          <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_purchase_history.total_qty')}</p><p className="text-lg font-bold text-gray-800">{summary.total_purchase_qty.toLocaleString()}</p></div>
          <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_purchase_history.avg_cost')}</p><p className="text-lg font-bold text-gray-800">{summary.average_purchase_cost == null ? '—' : formatCurrency(summary.average_purchase_cost)}</p></div>
          <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_purchase_history.gross_profit')}</p><p className="text-lg font-bold text-brand-600">{formatCurrency(summary.gross_profit)}</p></div>
          <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_purchase_history.gross_margin')}</p><p className="text-lg font-bold text-gray-800">{fmtPct(summary.gross_margin)}</p></div>
        </div>
      )}

      <div className={`${cardClasses} p-5 overflow-x-auto`}>
        {loading ? (
          <p className="text-center text-[var(--text-secondary)] py-8">{t('common.loading')}</p>
        ) : (
          <table className={tableClasses}>
            <thead>
              <tr className={theadRowClasses}>
                <th className="p-2">{t('page_purchase_history.col_po_number')}</th>
                <th className="p-2">{t('page_purchase_history.col_supplier')}</th>
                <th className="p-2">{t('page_purchase_history.col_date')}</th>
                <th className="p-2">{t('page_purchase_history.col_product')}</th>
                <th className="p-2">{t('page_purchase_history.col_qty')}</th>
                <th className="p-2">{t('page_purchase_history.col_unit_cost')}</th>
                <th className="p-2">{t('page_purchase_history.col_total_cost')}</th>
                <th className="p-2">{t('page_purchase_history.col_received_date')}</th>
              </tr>
            </thead>
            <tbody className={tbodyClasses}>
              {rows.map((row, i) => (
                <tr key={i} className={rowClasses}>
                  <td className="p-2 font-mono text-xs text-brand-600">{row.po_number}</td>
                  <td className="p-2 text-[var(--text-primary)]">{row.supplier_name}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{row.purchase_date}</td>
                  <td className="p-2 text-[var(--text-primary)]">{row.product_sku} · {row.product_name}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{row.qty}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{formatCurrency(row.unit_cost)}</td>
                  <td className="p-2 font-semibold text-[var(--text-primary)]">{formatCurrency(row.total_cost)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{row.received_date ? row.received_date.slice(0, 10) : '-'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-[var(--text-secondary)]">{t('page_purchase_history.empty_state')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

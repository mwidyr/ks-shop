import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listReplenishment } from '../api/replenishment'
import { listSuppliers } from '../api/suppliers'
import { createPurchaseRequisition, addRequisitionItem } from '../api/purchaseRequisitions'
import { formatCurrency } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'

const basisOptions = [7, 14, 30]

function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString() }
function fmtDays(n) { return n == null ? '—' : Number(n).toFixed(1) }

const statusColors = {
  critical: 'bg-red-100 text-red-700',
  requires_replenishment: 'bg-amber-100 text-amber-700',
  ok: 'bg-gray-100 text-gray-500',
}

export default function ReplenishmentPlanning() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [basis, setBasis] = useState(30)
  const [targetStockDays, setTargetStockDays] = useState(30)
  const [supplierId, setSupplierId] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [planned, setPlanned] = useState({}) // variantId -> qty, local working values only
  const [loading, setLoading] = useState(true)
  const [creatingPO, setCreatingPO] = useState(false)

  useEffect(() => { listSuppliers(true).then(setSuppliers) }, [])

  useEffect(() => {
    setLoading(true)
    listReplenishment({ basis, targetStockDays, supplierId: supplierId || undefined, stockStatus: stockStatus || undefined })
      .then((data) => { setRows(data); setLoading(false) })
  }, [basis, targetStockDays, supplierId, stockStatus])

  const summary = {
    requiresReplenishment: rows.filter((r) => r.stock_status === 'requires_replenishment').length,
    critical: rows.filter((r) => r.stock_status === 'critical').length,
    totalIncoming: rows.reduce((s, r) => s + r.incoming_stock, 0),
  }

  // Only meaningful once a single supplier is selected - a Purchase Requisition groups by
  // supplier automatically, but starting from one supplier's planned rows here keeps this
  // action predictable (one supplier's worth of items pre-added, ready to confirm).
  const plannedRows = rows.filter((r) => (planned[r.variant_id] ?? r.suggested_reorder_qty) > 0)

  async function handleCreatePO() {
    setCreatingPO(true)
    try {
      const { id } = await createPurchaseRequisition()
      for (const r of plannedRows) {
        await addRequisitionItem(id, {
          variant_id: r.variant_id,
          planned_qty: planned[r.variant_id] ?? r.suggested_reorder_qty,
        })
      }
      navigate(`/purchase-requisitions/${id}`)
    } finally {
      setCreatingPO(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_replenishment.all_suppliers')}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_replenishment.all_statuses')}</option>
          <option value="critical">{t('page_replenishment.status_critical')}</option>
          <option value="requires_replenishment">{t('page_replenishment.status_requires_replenishment')}</option>
          <option value="ok">{t('page_replenishment.status_ok')}</option>
        </select>
        <div className="flex items-center gap-1">
          {basisOptions.map((b) => (
            <button key={b} onClick={() => setBasis(b)} className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${basis === b ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>
              {b}D
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          {t('page_replenishment.target_stock_days')}
          <input type="number" min="1" value={targetStockDays} onChange={(e) => setTargetStockDays(Number(e.target.value) || 30)} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        </label>
        {supplierId && plannedRows.length > 0 && (
          <button onClick={handleCreatePO} disabled={creatingPO} className="ml-auto bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {creatingPO ? t('page_purchase_requisitions.creating') : t('page_replenishment.create_po_from_plan')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_replenishment.requires_replenishment')}</p><p className="text-lg font-bold text-amber-600">{summary.requiresReplenishment}</p></div>
        <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_replenishment.critical_stock')}</p><p className="text-lg font-bold text-red-600">{summary.critical}</p></div>
        <div className="bg-white rounded-2xl shadow-sm p-4"><p className="text-[11px] uppercase text-gray-400 mb-1">{t('page_replenishment.total_incoming')}</p><p className="text-lg font-bold text-gray-800">{fmtNum(summary.totalIncoming)}</p></div>
      </div>

      <div className={`${cardClasses} p-5 overflow-x-auto`}>
        {loading ? (
          <p className="text-center text-[var(--text-secondary)] py-8">{t('common.loading')}</p>
        ) : (
          <table className={tableClasses}>
            <thead>
              <tr className={theadRowClasses}>
                <th className="p-2">{t('page_replenishment.col_product')}</th>
                <th className="p-2">{t('page_replenishment.col_variant')}</th>
                <th className="p-2">{t('page_replenishment.col_physical')}</th>
                <th className="p-2">{t('page_replenishment.col_incoming')}</th>
                <th className="p-2">{t('page_replenishment.col_ordered')}</th>
                <th className="p-2">{t('page_replenishment.col_sellable')}</th>
                <th className="p-2">{basis}D {t('page_replenishment.col_sales')}</th>
                <th className="p-2">{t('page_replenishment.col_avg_daily')}</th>
                <th className="p-2">{t('page_replenishment.col_stock_days')}</th>
                <th className="p-2">{t('page_replenishment.col_suggested')}</th>
                <th className="p-2">{t('page_replenishment.col_planned')}</th>
                <th className="p-2">{t('page_replenishment.col_status')}</th>
              </tr>
            </thead>
            <tbody className={tbodyClasses}>
              {[...rows].sort((a, b) => (a.estimated_stock_days ?? Infinity) - (b.estimated_stock_days ?? Infinity)).map((r) => (
                <tr key={r.variant_id} className={rowClasses}>
                  <td className="p-2">
                    <p className="font-medium text-[var(--text-primary)]">{r.product_sku}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{r.product_name} · {r.supplier_name}</p>
                  </td>
                  <td className="p-2 text-[var(--text-secondary)]">{r.color} / {r.size}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{fmtNum(r.physical_stock)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{fmtNum(r.incoming_stock)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{fmtNum(r.ordered_qty)}</td>
                  <td className="p-2 font-semibold text-[var(--text-primary)]">{fmtNum(r.sellable_stock)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{fmtNum(basis === 7 ? r.sales_7d : basis === 14 ? r.sales_14d : r.sales_30d)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{r.avg_daily_sales == null ? t('page_replenishment.no_sales_yet') : r.avg_daily_sales.toFixed(1)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{fmtDays(r.estimated_stock_days)}</td>
                  <td className="p-2 font-semibold text-brand-600">{fmtNum(r.suggested_reorder_qty)}</td>
                  <td className="p-2">
                    <input
                      type="number" min="0"
                      value={planned[r.variant_id] ?? r.suggested_reorder_qty}
                      onChange={(e) => setPlanned((p) => ({ ...p, [r.variant_id]: Number(e.target.value) || 0 }))}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[r.stock_status]}`}>
                      {t(`page_replenishment.status_${r.stock_status}`)}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={12} className="p-6 text-center text-[var(--text-secondary)]">{t('page_replenishment.empty_state')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400">{t('page_replenishment.planned_hint')}</p>
    </div>
  )
}

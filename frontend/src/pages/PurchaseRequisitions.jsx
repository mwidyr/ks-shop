import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { listPurchaseRequisitions, createPurchaseRequisition } from '../api/purchaseRequisitions'
import { formatCurrency } from '../utils/format'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'

const statusColors = {
  draft: 'bg-yellow-100 text-yellow-700',
  submitted: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

export default function PurchaseRequisitions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [requisitions, setRequisitions] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  function reload() {
    listPurchaseRequisitions().then((data) => { setRequisitions(data); setLoading(false) })
  }

  useEffect(reload, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await createPurchaseRequisition()
      navigate(`/purchase-requisitions/${res.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{t('page_purchase_requisitions.subtitle')}</p>
        <button onClick={handleCreate} disabled={creating} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {creating ? t('page_purchase_requisitions.creating') : t('page_purchase_requisitions.create_button')}
        </button>
      </div>

      <div className={`${cardClasses} overflow-x-auto`}>
        <table className={tableClasses}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-3.5">{t('page_purchase_requisitions.th_requisition_no')}</th>
              <th className="p-3.5">{t('page_purchase_requisitions.th_suppliers')}</th>
              <th className="p-3.5">{t('page_purchase_requisitions.th_total_planned')}</th>
              <th className="p-3.5">{t('page_purchase_requisitions.th_status')}</th>
              <th className="p-3.5">{t('page_purchase_requisitions.th_created')}</th>
              <th className="p-3.5"></th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {requisitions.map((req) => (
              <tr key={req.id} className={`${rowClasses} cursor-pointer`} onClick={() => navigate(`/purchase-requisitions/${req.id}`)}>
                <td className="p-3.5 font-mono text-xs text-brand-600">{req.requisition_no}</td>
                <td className="p-3.5 text-[var(--text-secondary)]">{req.supplier_count}</td>
                <td className="p-3.5 text-[var(--text-primary)] font-semibold">{formatCurrency(req.total_planned_amount)}</td>
                <td className="p-3.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[req.status]}`}>{t(`page_purchase_requisitions.status_${req.status}`)}</span>
                </td>
                <td className="p-3.5 text-[var(--text-secondary)]">{new Date(req.created_at).toLocaleDateString()}</td>
                <td className="p-3.5 text-brand-600 text-xs font-semibold">{t('page_purchase_requisitions.detail_link')}</td>
              </tr>
            ))}
            {!loading && requisitions.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-[var(--text-secondary)]">{t('page_purchase_requisitions.empty_state')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        {t('page_purchase_requisitions.legacy_hint')} <Link to="/purchases" className="text-brand-600 hover:underline">{t('page_purchases.title')}</Link>
      </p>
    </div>
  )
}

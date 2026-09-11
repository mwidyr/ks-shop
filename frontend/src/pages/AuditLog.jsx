import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listActivityLog } from '../api/activityLog'

export default function AuditLog() {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const actionLabels = {
    'status: -> pending': t('page_audit_log.action_order_created'),
    price_changed: t('page_audit_log.action_price_changed'),
    fee_changed: t('page_audit_log.action_fee_changed'),
    label_added: t('page_audit_log.action_label_added'),
    label_removed: t('page_audit_log.action_label_removed'),
    role_changed: t('page_audit_log.action_role_changed'),
    active_changed: t('page_audit_log.action_active_changed'),
  }

  function actionLabel(action) {
    if (actionLabels[action]) return actionLabels[action]
    if (action.startsWith('status:')) return t('page_audit_log.action_status_change', { status: action.replace('status: ', '') })
    if (action.startsWith('stock:')) return t('page_audit_log.action_stock_change', { change: action.replace('stock: ', '') })
    return action
  }

  const entityLabels = {
    order: t('page_audit_log.entity_order'),
    product_variant: t('page_audit_log.entity_product_variant'),
    pickup_chain: t('page_audit_log.entity_pickup_chain'),
    customer: t('page_audit_log.entity_customer'),
    user: t('page_audit_log.entity_user'),
  }

  function reload() {
    setLoading(true)
    listActivityLog(page).then((res) => {
      setItems(res.items)
      setLoading(false)
    })
  }

  useEffect(reload, [page])

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">{t('page_audit_log.col_time')}</th>
              <th className="p-3">{t('page_audit_log.col_actor')}</th>
              <th className="p-3">{t('page_audit_log.col_entity')}</th>
              <th className="p-3">{t('page_audit_log.col_action')}</th>
              <th className="p-3">{t('page_audit_log.col_detail')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400">{t('page_audit_log.empty_state')}</td></tr>
            )}
            {items.map((e, i) => (
              <tr key={i}>
                <td className="p-3 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString('en-US')}</td>
                <td className="p-3 font-medium text-gray-800">{e.actor_name}</td>
                <td className="p-3 font-mono text-xs text-gray-600">{entityLabels[e.entity_type] || e.entity_type} #{e.entity_id}</td>
                <td className="p-3 text-gray-700">{actionLabel(e.action)}</td>
                <td className="p-3 text-gray-500">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40">{t('page_audit_log.prev')}</button>
        <button onClick={() => setPage((p) => p + 1)} disabled={items.length < 50} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40">{t('page_audit_log.next')}</button>
      </div>
    </div>
  )
}

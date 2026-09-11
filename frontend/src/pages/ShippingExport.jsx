import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { useTranslation } from 'react-i18next'
import { listShippingExport, markExported, updateTrackingNumber } from '../api/shippingExport'
import { formatCurrency } from '../utils/format'

function statusText(row, t) {
  if (row.status === 'shipped' && row.exported_at) return t('page_shipping_export.status.already_shipped')
  if (row.exported_at && row.tracking_number) return t('page_shipping_export.status.already_exported')
  if (row.exported_at) return t('page_shipping_export.status.exported_no_tracking', { date: new Date(row.exported_at).toLocaleDateString('en-US') })
  return t('page_shipping_export.status.not_exported')
}

export default function ShippingExport() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function reload() {
    setLoading(true)
    listShippingExport().then((res) => {
      setRows(res)
      setLoading(false)
      setSelected(new Set())
    })
  }

  useEffect(reload, [])

  const homeDelivery = rows.filter((r) => r.is_home_delivery)
  const minimarket = rows.filter((r) => !r.is_home_delivery)

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function exportGroup(group, format) {
    const picked = group.filter((r) => selected.has(r.order_id))
    if (picked.length === 0) return
    const csvRows = picked.map((r, i) =>
      format === 'a'
        ? {
            '#': i + 1,
            [t('page_shipping_export.csv.recipient')]: `${r.customer_name}\n${r.order_no}`,
            [t('page_shipping_export.csv.address')]: r.shipping_address,
            [t('page_shipping_export.csv.cod')]: formatCurrency(r.total_to_pay),
            [t('page_shipping_export.csv.status')]: statusText(r, t),
          }
        : {
            '#': i + 1,
            [t('page_shipping_export.csv.buyer')]: `${r.customer_name}\n${r.order_no}`,
            [t('page_shipping_export.csv.store')]: `${r.pickup_store_name} ${r.pickup_store_code}`.trim(),
            [t('page_shipping_export.csv.item_value')]: formatCurrency(r.item_value),
            [t('page_shipping_export.csv.shipping_fee')]: t('page_shipping_export.csv.shipping_fee_value', {
              fee: formatCurrency(r.shipping_fee),
              total: formatCurrency(r.total_to_pay),
            }),
            [t('page_shipping_export.csv.status')]: statusText(r, t),
          }
    )
    const csv = Papa.unparse(csvRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shipping-export-${format}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setBusy(true)
    try {
      await markExported(picked.map((r) => r.order_id))
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function saveTracking(orderId, value) {
    await updateTrackingNumber(orderId, value)
    reload()
  }

  function Table({ title, group, format }) {
    if (group.length === 0) return null
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button
            onClick={() => exportGroup(group, format)}
            disabled={busy || group.every((r) => !selected.has(r.order_id))}
            className="bg-gray-800 hover:bg-black disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {t('page_shipping_export.export_csv_button', { count: group.filter((r) => selected.has(r.order_id)).length })}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase border-b">
                <th className="p-2"></th>
                <th className="p-2">{t('page_shipping_export.column_order')}</th>
                <th className="p-2">{format === 'a' ? t('page_shipping_export.column_address') : t('page_shipping_export.column_store')}</th>
                <th className="p-2">{format === 'a' ? t('page_shipping_export.column_cod') : t('page_shipping_export.column_value_shipping')}</th>
                <th className="p-2">{t('page_shipping_export.column_status')}</th>
                <th className="p-2">{t('page_shipping_export.column_tracking')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {group.map((r) => (
                <tr key={r.order_id}>
                  <td className="p-2">
                    <input type="checkbox" checked={selected.has(r.order_id)} onChange={() => toggle(r.order_id)} />
                  </td>
                  <td className="p-2">
                    <p className="font-semibold text-gray-800">{r.customer_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.order_no}</p>
                    {r.group_order_nos?.length > 0 && (
                      <p className="text-[10px] text-amber-600">+ {r.group_order_nos.join(', ')}</p>
                    )}
                  </td>
                  <td className="p-2 text-gray-500">
                    {format === 'a'
                      ? r.shipping_address
                      : [r.pickup_store_name, r.pickup_store_code && `#${r.pickup_store_code}`].filter(Boolean).join(' ') || '-'}
                  </td>
                  <td className="p-2 text-gray-700">
                    {format === 'a'
                      ? formatCurrency(r.total_to_pay)
                      : <>{formatCurrency(r.item_value)} / {formatCurrency(r.shipping_fee)}</>}
                  </td>
                  <td className="p-2 text-xs text-gray-500">{statusText(r, t)}</td>
                  <td className="p-2">
                    <input
                      defaultValue={r.tracking_number || ''}
                      onBlur={(e) => e.target.value !== (r.tracking_number || '') && saveTracking(r.order_id, e.target.value)}
                      placeholder={t('page_shipping_export.tracking_placeholder')}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (loading) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6">
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
          {t('page_shipping_export.empty_state')}
        </div>
      ) : (
        <>
          <Table title={t('page_shipping_export.table_title_address')} group={homeDelivery} format="a" />
          <Table title={t('page_shipping_export.table_title_minimarket')} group={minimarket} format="b" />
        </>
      )}
    </div>
  )
}

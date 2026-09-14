import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listShippingExport, markExported } from '../api/shippingExport'
import { formatCurrency } from '../utils/format'

// "Masalah" here only means missing shipping_address - we don't have address-region data to
// detect remote-island/COD-restricted deliveries the way the reference system claims to.
function classify(r) {
  if (r.exported_at) return 'exported'
  if (!r.shipping_address) return 'problem'
  return 'exportable'
}

function truncate(str, max) {
  return (str || '').slice(0, max)
}

// Literal column headers required by HCT Shinchu's own import template (not run through t() -
// the receiving system parses these by exact position/text). Multi-line text (\n) reproduces
// the template's wrapped header cells exactly.
const KURIR_TEMPLATE_HEADERS = [
  '序號\n(無用途)',
  '訂單號\n長度限制: 20碼\n請勿使用中文',
  '收件人姓名(必填)\n長度限制: 20碼',
  '收件人地址(必填)\n中文限制: 50字',
  '收件人電話(必填)\n長度限制: 15碼',
  '託運備註\n中文限制: 50字',
  '(商品別編號)\n勿填',
  '商品數量(必填)\n(限數字)\n<100',
  '才積重量\n限數字',
  '代收貨款\n限數字',
  '指定配送日期YYYYMMDD\n範例: 20140220    ->2月20號',
  '指定配送時間\n範例:   1   (上午 -> 09~13)\n            2   (下午 -> 13~17)\n            3   (晚上 -> 17~20)',
]

export default function ExportKurirModal({ onClose, onExported }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeExported, setIncludeExported] = useState(false)
  const [statusTab, setStatusTab] = useState('exportable')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)

  function reload() {
    setLoading(true)
    listShippingExport(includeExported).then((data) => {
      setRows(data.filter((r) => r.chain_type === 'courier'))
      setLoading(false)
      setSelected(new Set())
    })
  }

  useEffect(reload, [includeExported])

  const statusCounts = {
    exportable: rows.filter((r) => classify(r) === 'exportable').length,
    problem: rows.filter((r) => classify(r) === 'problem').length,
    exported: rows.filter((r) => classify(r) === 'exported').length,
  }

  const visible = useMemo(() => {
    let list = rows.filter((r) => classify(r) === statusTab)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        r.order_no.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.shipping_address || '').toLowerCase().includes(q) ||
        (r.tracking_number || '').toLowerCase().includes(q))
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, search, rows])

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelected((s) => (s.size === visible.length ? new Set() : new Set(visible.map((r) => r.order_id))))
  }

  async function handleExport() {
    const picked = visible.filter((r) => selected.has(r.order_id))
    if (picked.length === 0) return
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const dataRows = picked.map((r) => [
        '', // 序號 - unused
        r.order_no,
        truncate(r.customer_name, 20),
        truncate(r.shipping_address, 50),
        truncate(r.customer_phone, 15),
        '', // 託運備註 - no equivalent data
        '', // (商品別編號) - "don't fill"
        r.total_qty,
        '', // 才積重量 - no data
        r.total_to_pay,
        '', // 指定配送日期 - no scheduling feature
        '', // 指定配送時間 - no scheduling feature
      ])
      const ws = XLSX.utils.aoa_to_sheet([KURIR_TEMPLATE_HEADERS, ...dataRows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Export')
      XLSX.writeFile(wb, `ekspor-kurir-${new Date().toISOString().slice(0, 10)}.xlsx`)
      await markExported(picked.flatMap((r) => r.order_ids))
      reload()
      onExported?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg text-gray-800">{t('page_orders.export_kurir_title')}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{t('page_orders.export_kurir_desc')}</p>
        </div>

        <div className="p-5 pb-3 shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page_orders.export_search_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="px-5 flex gap-4 border-b border-gray-100 overflow-x-auto shrink-0">
          {[['exportable', t('page_orders.kurir_status_exportable')], ['problem', t('page_orders.status_problem')], ['exported', t('page_orders.kurir_status_exported')]].map(([key, label]) => (
            <button key={key} onClick={() => setStatusTab(key)} className={`shrink-0 pb-2 text-sm font-semibold border-b-2 ${statusTab === key ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400'}`}>
              {label} {statusCounts[key]}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 px-5 py-3 text-sm text-gray-600 shrink-0">
          <input type="checkbox" checked={includeExported} onChange={(e) => setIncludeExported(e.target.checked)} />
          {t('page_orders.include_exported')}
        </label>

        <div className="flex-1 overflow-y-auto px-5">
          {loading ? (
            <p className="text-center text-gray-400 py-8">{t('common.loading')}</p>
          ) : visible.length === 0 ? (
            <p className="text-center text-gray-400 py-8">{t('page_orders.export_empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="py-2 w-8"><input type="checkbox" checked={selected.size === visible.length} onChange={toggleAll} /></th>
                  <th className="py-2">{t('page_orders.export_col_recipient')}</th>
                  <th className="py-2">{t('page_orders.export_col_address')}</th>
                  <th className="py-2">{t('page_orders.export_col_cod')}</th>
                  <th className="py-2">{t('page_orders.col_status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((r) => (
                  <tr key={r.order_id}>
                    <td className="py-2"><input type="checkbox" checked={selected.has(r.order_id)} onChange={() => toggle(r.order_id)} /></td>
                    <td className="py-2">
                      <p className="font-medium text-gray-800">{r.customer_name}</p>
                      <p className="text-xs text-gray-400">{r.order_no}</p>
                      {r.group_order_nos?.length > 0 && (
                        <p className="text-[10px] font-semibold text-amber-600">
                          {t('page_orders.export_merged_note', { count: r.group_order_nos.length })}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-gray-700 max-w-[220px] truncate">{r.shipping_address}</td>
                    <td className="py-2">{formatCurrency(r.total_to_pay)}</td>
                    <td className="py-2 text-gray-500">{t(`page_orders.kurir_status_${classify(r)}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.cancel')}</button>
          <button onClick={handleExport} disabled={selected.size === 0 || busy} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {t('page_orders.export_button_pesanan', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  )
}

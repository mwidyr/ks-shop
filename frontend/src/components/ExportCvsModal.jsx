import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listShippingExport, markExported } from '../api/shippingExport'
import { formatCurrency } from '../utils/format'

// Header text (including the '＊'/'*' required-field markers and the embedded newline in
// 其他資訊) copied verbatim from the client's own 711.xlsx (sheet '訂單匯入') and FamilyMart.xls
// (sheet '大量匯單') so this export is byte-for-byte the same header row as their real import
// template - not our own paraphrase of it. Excludes each template's own trailing
// result column ('excel驗證結果說明' on 711; FamilyMart has none), which the partner's system
// fills in after import, not something we generate.
const CVS_711_HEADERS = [
  "＊取件人姓名",
  "＊取件人手機",
  "＊取件門市",
  "* 溫層",
  "＊商品",
  "＊訂單金額",
  "＊運費金額",
  "買家下訂日期",
  "商品備註",
  "其他資訊\n(FB/LINE/IG帳號)",
]
const CVS_FAMILYMART_HEADERS = [
  "取件人姓名",
  "取件人手機",
  "取件門市",
  "商品金額",
  "運費金額",
  "訂購日期",
  "商品",
]

// Sheet tab names, matched to the real templates (711's '訂單匯入', FamilyMart's '大量匯單')
// rather than a generic 'Export' tab.
const SHEET_NAME_711 = "訂單匯入"
const SHEET_NAME_FAMILYMART = "大量匯單"

// Both templates require the phone in bare 10-digit-starting-with-09 form ("勿使用「-」符號" -
// no dashes) - strip everything else so a phone number saved with spaces/dashes/+886 doesn't
// fail the carrier's own import validation.
function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

// A row is "problem" if it's missing data the CVS export needs (store code to route the
// package, phone for the courier to contact the buyer) - not yet a formal validation, just
// what's actually required for a CVS handoff to succeed.
function classify(r) {
  if (r.exported_at && r.tracking_number) return 'has_tracking'
  if (r.exported_at) return 'no_tracking'
  if (!r.pickup_store_code || !r.customer_phone) return 'problem'
  return 'exportable'
}

export default function ExportCvsModal({ onClose, onExported }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeExported, setIncludeExported] = useState(false)
  const [chainTab, setChainTab] = useState('cvs_711')
  const [statusTab, setStatusTab] = useState('exportable')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)

  function reload() {
    setLoading(true)
    listShippingExport(includeExported).then((data) => {
      setRows(data.filter((r) => r.chain_type === 'cvs_711' || r.chain_type === 'cvs_familymart'))
      setLoading(false)
      setSelected(new Set())
    })
  }

  useEffect(reload, [includeExported])

  const chainFiltered = rows.filter((r) => r.chain_type === chainTab)
  const chainCounts = {
    cvs_711: rows.filter((r) => r.chain_type === 'cvs_711').length,
    cvs_familymart: rows.filter((r) => r.chain_type === 'cvs_familymart').length,
  }
  const statusCounts = {
    exportable: chainFiltered.filter((r) => classify(r) === 'exportable').length,
    problem: chainFiltered.filter((r) => classify(r) === 'problem').length,
    no_tracking: chainFiltered.filter((r) => classify(r) === 'no_tracking').length,
    has_tracking: chainFiltered.filter((r) => classify(r) === 'has_tracking').length,
  }

  const visible = useMemo(() => {
    let list = chainFiltered.filter((r) => classify(r) === statusTab)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        r.order_no.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.pickup_store_name || '').toLowerCase().includes(q) ||
        (r.tracking_number || '').toLowerCase().includes(q))
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainTab, statusTab, search, rows])

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
      // exceljs (not xlsx/SheetJS Community Edition) - the latter silently drops cell styling
      // and frozen panes on write, which can't reproduce 711's real bold white-on-blue header
      // with borders. exceljs supports both, so the export is a genuine visual match, not just
      // a data match.
      const mod = await import('exceljs')
      const ExcelJS = mod.default || mod
      const is711 = chainTab === 'cvs_711'

      // Both templates: Order/Product Amount = item value + shipping fee (the total the buyer
      // actually pays, e.g. 380+60=440 per the spec's own example), and Shipping Fee itself is
      // always exported as 0 - both explicit rules in the spec, not our interpretation.
      const totalAmount = (r) => r.item_value + r.shipping_fee

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet(is711 ? SHEET_NAME_711 : SHEET_NAME_FAMILYMART)

      // Column widths copied from 711.xlsx's own '訂單匯入' sheet (character-width units).
      // FamilyMart's real template has no custom column widths of its own.
      worksheet.columns = (is711
        ? [18.29, 15.57, 12.14, 8.71, 13.43, 13.0, 13.71, 14.14, 19.29, 8.71]
        : new Array(CVS_FAMILYMART_HEADERS.length).fill(19.4)
      ).map((width) => ({ width }))

      const headerRow = worksheet.addRow(is711 ? CVS_711_HEADERS : CVS_FAMILYMART_HEADERS)
      if (is711) {
        // Bold white text on blue fill with thin borders, centered, wrapping where the real
        // template wraps (買家下訂日期/其他資訊) - copied cell-for-cell from 711.xlsx's own
        // header row styling.
        headerRow.height = 27
        headerRow.eachCell((cell, colNumber) => {
          cell.font = { name: '微軟正黑體', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' },
          }
          cell.alignment = {
            horizontal: 'center', vertical: 'middle',
            wrapText: colNumber === 8 || colNumber === 10, // 買家下訂日期, 其他資訊
          }
        })
        worksheet.views = [{ state: 'frozen', ySplit: 1 }] // keep header visible while scrolling
      } else {
        // FamilyMart's real template has no fill/border/bold on its header, just this specific
        // font - matching it exactly rather than leaving ExcelJS's default (Calibri).
        headerRow.font = { name: '新細明體', size: 10 }
      }

      for (const r of picked) {
        const phone = normalizePhone(r.customer_phone)
        const row = is711
          ? [
              r.customer_name,
              phone,
              r.pickup_store_code,
              '常溫', // Temperature Type - always Room Temperature per spec
              r.items_summary,
              totalAmount(r),
              0, // Shipping Fee - always 0 per spec
              r.order_date,
              phone, // Product Note - the buyer's phone, same as Recipient Phone, per spec
              '', // Other Info (FB/LINE/IG) - no such field exists in this system
            ]
          : [
              r.customer_name,
              phone,
              r.pickup_store_code,
              // FamilyMart.xls's own instructions say every field's cell format must be Text
              // ("請將每個欄位的儲存格格式設為 文字 ※重要") - unlike 711, which specifies a
              // numeric type per amount field - so these are stringified, and given the '@'
              // (text) number format below, not left as real numeric cells.
              String(totalAmount(r)),
              '0', // Shipping Fee - always 0 per spec
              r.order_date,
              phone, // Product - FamilyMart has no separate note field, so the buyer's phone
                     // goes in Product itself here, per spec
            ]
        const dataRow = worksheet.addRow(row)
        // Phone and store code must stay bare text (leading zeros in store codes like "023060"
        // must survive) on both templates; FamilyMart additionally requires every column as
        // text per its own instructions above.
        const textCols = is711 ? [2, 3] : [2, 3, 4, 5]
        for (const col of textCols) dataRow.getCell(col).numFmt = '@'
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ekspor-cvs-${chainTab}-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

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
            <h2 className="font-bold text-lg text-gray-800">{t('page_orders.export_cvs_title')}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{t('page_orders.export_cvs_desc')}</p>
        </div>

        <div className="px-5 pt-3 flex gap-4 border-b border-gray-100 shrink-0">
          {[['cvs_711', t('page_orders.chain_711')], ['cvs_familymart', t('page_orders.chain_familymart')]].map(([key, label]) => (
            <button key={key} onClick={() => setChainTab(key)} className={`pb-2 text-sm font-semibold border-b-2 ${chainTab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>
              {label} {chainCounts[key]}
            </button>
          ))}
        </div>

        <div className="p-5 pb-3 shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page_orders.export_search_placeholder')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="px-5 flex gap-4 border-b border-gray-100 overflow-x-auto shrink-0">
          {[['exportable', t('page_orders.status_exportable')], ['problem', t('page_orders.status_problem')], ['no_tracking', t('page_orders.status_no_tracking')], ['has_tracking', t('page_orders.status_has_tracking')]].map(([key, label]) => (
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
                  <th className="py-2">{t('page_orders.export_col_buyer')}</th>
                  <th className="py-2">{t('page_orders.export_col_store')}</th>
                  <th className="py-2">{t('page_orders.export_col_item_value')}</th>
                  <th className="py-2">{t('page_orders.export_col_shipping_fee')}</th>
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
                    <td className="py-2">
                      <p className="text-gray-700">{r.pickup_store_name}</p>
                      <p className="text-xs text-gray-400">{r.pickup_store_code}</p>
                    </td>
                    <td className="py-2">{formatCurrency(r.item_value)}</td>
                    <td className="py-2">
                      <p>{formatCurrency(r.shipping_fee)}</p>
                      <p className="text-xs text-gray-400">{t('page_orders.paid_by_buyer', { amount: formatCurrency(r.total_to_pay) })}</p>
                    </td>
                    <td className="py-2 text-gray-500">{t(`page_orders.status_${classify(r)}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">{t('common.cancel')}</button>
          <button onClick={handleExport} disabled={selected.size === 0 || busy} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-full">
            {t('page_orders.export_button', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  )
}

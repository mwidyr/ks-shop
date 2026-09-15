import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { getProductReport, getOrderReport } from '../api/reports'

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}
function todayISO() {
  return isoDate(new Date())
}

// A different preset set than the page's own DateRangePicker (Today/7d/30d/Custom) - this
// modal's presets are calendar-aligned (this week/this month), matching what a "generate a
// report file" flow needs versus the page's rolling-window browsing presets.
const RANGE_PRESETS = ['today', 'week', 'month', 'all', 'custom']

function resolveRange(preset, customFrom, customTo) {
  const now = new Date()
  if (preset === 'today') {
    const d = todayISO()
    return { from: d, to: d }
  }
  if (preset === 'week') {
    const day = (now.getDay() + 6) % 7 // Monday = 0
    const monday = new Date(now)
    monday.setDate(now.getDate() - day)
    return { from: isoDate(monday), to: todayISO() }
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: isoDate(first), to: todayISO() }
  }
  if (preset === 'all') {
    return { from: '1970-01-01', to: todayISO() }
  }
  return { from: customFrom, to: customTo }
}

const DIMENSIONS = [
  { key: 'products', labelKey: 'page_reports.tab_products' },
  { key: 'customers', labelKey: 'page_reports.tab_customers' },
  { key: 'hosts', labelKey: 'page_reports.tab_hosts' },
  { key: 'staff', labelKey: 'page_reports.tab_staff' },
]

// Mirrors the exact on-screen column set per Reports.jsx tab (see that file's table headers) -
// 'customers'/'hosts'/'staff' all read from the same /reports/orders rows, just with a
// different identity column shown, exactly like the live page.
function buildSheet(dimension, items, t) {
  if (dimension === 'products') {
    return items.map((row) => ({
      [t('page_reports.col_product')]: row.name,
      [t('page_reports.col_sku')]: row.sku,
      [t('page_reports.col_variant')]: `${row.color}/${row.size}`,
      [t('page_reports.col_order_count')]: row.order_count,
      [t('page_reports.col_qty')]: row.qty,
      [t('page_reports.col_returns')]: row.qty_return,
      [t('page_reports.col_amount')]: row.revenue,
    }))
  }
  return items.map((row) => {
    const base = {
      [t('page_reports.col_date')]: row.date,
      [t('page_reports.col_order')]: row.order_no,
      [t('page_reports.col_status')]: row.status,
      [t('page_reports.col_product')]: row.product_name,
      [t('page_reports.col_variant')]: row.variant,
      [t('page_reports.col_qty')]: row.qty,
      [t('page_reports.col_amount')]: row.subtotal,
    }
    if (dimension !== 'hosts') {
      base[t('page_reports.col_customer_name')] = row.customer_name
      base[t('page_reports.col_customer_phone')] = row.customer_phone
    }
    if (dimension === 'hosts') base[t('page_reports.col_host')] = row.host_name
    if (dimension === 'staff') base[t('page_reports.col_staff')] = row.staff_name
    return base
  })
}

export default function ExportReportModal({ onClose }) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState('all')
  const [customFrom, setCustomFrom] = useState(todayISO())
  const [customTo, setCustomTo] = useState(todayISO())
  const [dimensions, setDimensions] = useState(new Set(DIMENSIONS.map((d) => d.key)))
  const [busy, setBusy] = useState(false)

  function toggleDimension(key) {
    setDimensions((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function fetchDimension(key) {
    const { from, to } = resolveRange(preset, customFrom, customTo)
    return key === 'products' ? getProductReport({ from, to }) : getOrderReport({ from, to, limit: 20000 })
  }

  async function collectSheets() {
    const picked = DIMENSIONS.filter((d) => dimensions.has(d.key))
    const results = await Promise.all(picked.map((d) => fetchDimension(d.key)))
    return picked.map((d, i) => ({
      key: d.key,
      label: t(d.labelKey),
      rows: buildSheet(d.key, results[i]?.items || [], t),
    }))
  }

  async function handleDownloadCsv() {
    if (dimensions.size === 0) return
    setBusy(true)
    try {
      const sheets = await collectSheets()
      const sections = sheets.map((s) => `${s.label}\n${Papa.unparse(s.rows)}`)
      const csv = '﻿' + sections.join('\n\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reports-${todayISO()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadExcel() {
    if (dimensions.size === 0) return
    setBusy(true)
    try {
      const [sheets, XLSX] = await Promise.all([collectSheets(), import('xlsx')])
      const wb = XLSX.utils.book_new()
      sheets.forEach((s) => {
        const ws = XLSX.utils.json_to_sheet(s.rows)
        XLSX.utils.book_append_sheet(wb, ws, s.label.slice(0, 31))
      })
      XLSX.writeFile(wb, `reports-${todayISO()}.xlsx`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-lg text-gray-800">{t('page_reports.export_modal_title')}</h2>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">{t('page_reports.export_range_label')}</p>
            <div className="flex flex-wrap gap-2">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`text-sm font-semibold px-4 py-1.5 rounded-full border ${
                    preset === p ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(`page_reports.export_range_${p}`)}
                </button>
              ))}
            </div>
            {preset === 'all' && <p className="text-xs text-amber-600 mt-2">{t('page_reports.export_range_all_hint')}</p>}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 mt-3">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-gray-400 text-sm">{t('shared.date_range_separator')}</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">{t('page_reports.export_dimensions_label')}</p>
            <div className="border border-gray-200 rounded-xl divide-y bg-gray-50">
              {DIMENSIONS.map((d) => (
                <label key={d.key} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={dimensions.has(d.key)} onChange={() => toggleDimension(d.key)} />
                  {t(d.labelKey)}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{t('page_reports.export_dimensions_hint')}</p>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 hover:underline">{t('common.cancel')}</button>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={busy || dimensions.size === 0}
              className="border border-gray-300 text-gray-700 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50 disabled:opacity-40"
            >
              {t('page_reports.export_download_csv')}
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={busy || dimensions.size === 0}
              className="bg-gray-900 hover:bg-black text-white text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-40"
            >
              {t('page_reports.export_download_excel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

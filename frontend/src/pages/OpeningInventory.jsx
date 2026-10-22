import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { useAuth } from '../context/AuthContext'
import { listOpeningImports, getOpeningImport, createOpeningImport, approveOpeningImport, rejectOpeningImport } from '../api/openingInventory'
import { tableClasses, theadRowClasses, tbodyClasses, cardClasses } from '../components/Table'
import { formatCNY } from '../utils/format'

const statusColors = {
  draft: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-100 text-gray-500',
}

// Initial Inventory Setup (#132): FIFO go-live. Upload a CSV of verified on-hand quantities and
// approved RMB unit costs (sku, qty, unit_cost_rmb, exchange_rate), review it against the system's
// Actual stock and approve it - approval creates the opening cost layers and switches FIFO on.
// Past orders are not rewritten. Super Admin only.
export default function OpeningInventory() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [defaultRate, setDefaultRate] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    return listOpeningImports().then(setData)
  }
  useEffect(() => { if (user?.role === 'super_user') reload() }, [user])

  if (user && user.role !== 'super_user') return <Navigate to="/" replace />

  async function open(id) {
    setError('')
    setSelected(await getOpeningImport(id))
  }

  function downloadTemplate() {
    const csv = Papa.unparse([{ sku: 'C011-RED-M', qty: 12, unit_cost_rmb: 35.5, exchange_rate: 4.45 }])
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'opening-inventory-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    Papa.parse(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
      complete: async (results) => {
        const lines = results.data.map((row, i) => ({
          row_no: i + 2, // row 1 is the header
          sku: String(row.sku || '').trim(),
          qty: Number(row.qty) || 0,
          unit_cost_rmb: Number(row.unit_cost_rmb) || 0,
          exchange_rate: Number(row.exchange_rate) || Number(defaultRate) || 0,
        }))
        if (lines.length === 0) { setError(t('page_opening_inventory.empty_file')); return }
        setBusy(true)
        try {
          const res = await createOpeningImport({ file_name: file.name, note, lines })
          setNote('')
          await reload()
          await open(res.id)
        } catch (err) {
          setError(err.response?.data?.error || t('page_opening_inventory.upload_failed'))
        } finally {
          setBusy(false)
        }
      },
    })
  }

  async function act(fn) {
    setBusy(true)
    setError('')
    try {
      await fn(selected.id)
      await reload()
      await open(selected.id)
    } catch (err) {
      setError(err.response?.data?.error || t('page_opening_inventory.action_failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl space-y-4">
      <div className={`${cardClasses} p-5 space-y-3`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-lg text-[var(--text-primary)]">{t('page_opening_inventory.title')}</h2>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${data.fifo_live ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {data.fifo_live ? t('page_opening_inventory.fifo_live') : t('page_opening_inventory.fifo_not_live')}
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{t('page_opening_inventory.intro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_opening_inventory.default_rate')}</label>
            <input type="number" min="0" step="0.0001" value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[11px] text-gray-500 mb-0.5">{t('page_opening_inventory.note')}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <label className={`bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {t('page_opening_inventory.upload_button')}
            <input type="file" accept=".csv,text/csv" onChange={upload} className="hidden" />
          </label>
          <button type="button" onClick={downloadTemplate} className="text-sm text-brand-600 hover:underline">{t('page_opening_inventory.template_button')}</button>
        </div>
        <p className="text-[11px] text-gray-400">{t('page_opening_inventory.columns_hint')}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className={`${cardClasses} overflow-x-auto`}>
        <table className={tableClasses}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-2 pl-4">{t('page_opening_inventory.col_file')}</th>
              <th className="p-2">{t('page_opening_inventory.col_status')}</th>
              <th className="p-2">{t('page_opening_inventory.col_lines')}</th>
              <th className="p-2">{t('page_opening_inventory.col_qty')}</th>
              <th className="p-2">{t('page_opening_inventory.col_uploaded')}</th>
              <th className="p-2 pr-4">{t('page_opening_inventory.col_approved')}</th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {data.imports.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-gray-400">{t('page_opening_inventory.no_imports')}</td></tr>
            )}
            {data.imports.map((imp) => (
              <tr key={imp.id} onClick={() => open(imp.id)} className={`cursor-pointer hover:bg-gray-50 ${selected?.id === imp.id ? 'bg-brand-50' : ''}`}>
                <td className="p-2 pl-4 text-[var(--text-primary)]">{imp.file_name || `#${imp.id}`}{imp.note && <p className="text-[11px] text-gray-400">{imp.note}</p>}</td>
                <td className="p-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[imp.status]}`}>{t(`page_opening_inventory.status_${imp.status}`)}</span></td>
                <td className="p-2">{imp.line_count}{imp.error_count > 0 && <span className="ml-1 text-xs text-red-600">({t('page_opening_inventory.errors_count', { count: imp.error_count })})</span>}</td>
                <td className="p-2">{imp.total_qty}</td>
                <td className="p-2 text-xs text-[var(--text-secondary)]">{imp.created_by} · {new Date(imp.created_at).toLocaleString()}</td>
                <td className="p-2 pr-4 text-xs text-[var(--text-secondary)]">{imp.approved_at ? `${imp.approved_by} · ${new Date(imp.approved_at).toLocaleString()}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className={`${cardClasses} overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 flex-wrap p-4 border-b border-[var(--table-divider)]">
            <h3 className="font-bold text-[var(--text-primary)]">{selected.file_name || `#${selected.id}`}</h3>
            {selected.status === 'draft' && (
              <div className="flex gap-2">
                <button onClick={() => { if (window.confirm(t('page_opening_inventory.approve_confirm'))) act(approveOpeningImport) }}
                  disabled={busy || selected.error_count > 0}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                  {t('page_opening_inventory.approve_button')}
                </button>
                <button onClick={() => act(rejectOpeningImport)} disabled={busy} className="text-sm font-semibold px-3 py-1.5 text-red-600 hover:underline">
                  {t('page_opening_inventory.reject_button')}
                </button>
              </div>
            )}
          </div>
          {selected.status === 'draft' && selected.error_count > 0 && (
            <p className="px-4 pt-3 text-xs text-red-600">{t('page_opening_inventory.fix_errors_hint')}</p>
          )}
          <div className="overflow-x-auto">
            <table className={tableClasses}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="p-2 pl-4">{t('page_opening_inventory.col_row')}</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">{t('page_opening_inventory.col_product')}</th>
                  <th className="p-2">{t('page_opening_inventory.col_qty')}</th>
                  <th className="p-2">{t('page_opening_inventory.col_system_actual')}</th>
                  <th className="p-2">{t('page_opening_inventory.col_unit_cost')}</th>
                  <th className="p-2">{t('page_opening_inventory.col_rate')}</th>
                  <th className="p-2 pr-4">{t('page_opening_inventory.col_problem')}</th>
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {selected.lines.map((l) => {
                  const diff = l.system_actual != null && l.system_actual !== l.qty
                  return (
                    <tr key={l.id} className={l.error ? 'bg-red-50' : ''}>
                      <td className="p-2 pl-4 text-xs text-gray-400">{l.row_no}</td>
                      <td className="p-2 font-mono text-xs">{l.sku}</td>
                      <td className="p-2 text-[var(--text-primary)]">{l.product_name || '–'}</td>
                      <td className="p-2 font-semibold">{l.qty}</td>
                      <td className={`p-2 ${diff ? 'text-amber-600 font-semibold' : 'text-[var(--text-secondary)]'}`} title={diff ? t('page_opening_inventory.diff_hint') : ''}>
                        {l.system_actual ?? '–'}
                      </td>
                      <td className="p-2">{formatCNY(l.unit_cost_rmb)}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{l.exchange_rate}</td>
                      <td className="p-2 pr-4 text-xs text-red-600">{l.error || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

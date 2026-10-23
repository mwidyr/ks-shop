import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getSkuReport } from '../api/products'

// Super admin check before go-live: variants whose SKU isn't clean PRODUCT CODE - English COLOR -
// SIZE yet (placeholder product code, color outside Color Master or without an English name,
// collision suffix, manual SKU).
export default function SkuReportPanel() {
  const { t } = useTranslation()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)

  function toggle() {
    setOpen((o) => !o)
    if (!rows) getSkuReport().then(setRows).catch(() => setRows([]))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm mb-4">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700">
        <span>{t('page_products.sku_report_title')}{rows ? ` (${rows.length})` : ''}</span>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 mb-2">{t('page_products.sku_report_hint')}</p>
          {!rows ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-green-600">{t('page_products.sku_report_clean')}</p>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.variant_id}-${r.issue}`} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3"><Link to={`/products/${r.product_id}/edit`} className="text-brand-600 hover:underline">{r.product_code || '–'}</Link></td>
                      <td className="py-1.5 pr-3 text-gray-700">{r.product_name}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.sku}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{r.color}/{r.size}</td>
                      <td className="py-1.5 text-xs text-amber-700">{t(`page_products.sku_issue_${r.issue}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useTranslation } from 'react-i18next'
import { listProducts, createProduct, updateProduct, updateVariant, deleteProduct } from '../api/products'
import { formatCurrency } from '../utils/format'
import { resolveUrl } from '../utils/image'
import { IconChevronDown, IconPencil, IconTrash } from '../components/icons'

const statusLabels = { active: 'Active', low_stock: 'Low Stock', out_of_stock: 'Out of Stock', nonaktif: 'Draft' }
const statusColors = {
  active: 'bg-green-100 text-green-700', low_stock: 'bg-yellow-100 text-yellow-700',
  out_of_stock: 'bg-red-100 text-red-700', nonaktif: 'bg-gray-100 text-gray-500',
}

function ProductRow({ p, onChanged, selected, onToggleSelect }) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const totalStock = p.variants.reduce((sum, v) => sum + v.total_stock, 0)
  const prices = p.variants.map((v) => v.price)
  const priceLabel = prices.length ? (Math.min(...prices) === Math.max(...prices)
    ? formatCurrency(Math.min(...prices))
    : `${formatCurrency(Math.min(...prices))} - ${formatCurrency(Math.max(...prices))}`) : '-'
  const discountPcts = p.variants
    .filter((v) => v.compare_at_price > v.price)
    .map((v) => Math.round((1 - v.price / v.compare_at_price) * 100))
  const maxDiscountPct = discountPcts.length ? Math.max(...discountPcts) : 0

  async function toggleActive() {
    await updateProduct(p.id, { name: p.name, description: p.description, category: p.category, brand: p.brand, is_active: !p.is_active })
    onChanged()
  }

  async function handleDelete() {
    setError('')
    setMenuOpen(false)
    try {
      await deleteProduct(p.id)
      onChanged()
    } catch (err) {
      setError(err.response?.data?.error || t('page_products.delete_product_failed'))
    }
  }

  return (
    <tr className={`hover:bg-gray-50 align-top ${selected ? 'bg-brand-50/40' : ''}`}>
      <td className="p-3">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(p.id)} />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-3">
          <img src={resolveUrl(p.images[0]?.url)} className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">{p.name}</p>
            <p className="text-xs text-gray-500">{p.category} · {t('page_products.variant_count', { count: p.variants.length })}</p>
          </div>
        </div>
      </td>
      <td className="p-3 font-semibold text-brand-600 whitespace-nowrap">
        {priceLabel}
        {maxDiscountPct > 0 && (
          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 align-middle">-{maxDiscountPct}%</span>
        )}
      </td>
      <td className="p-3 text-gray-600">{totalStock}</td>
      <td className="p-3 text-gray-600">{p.units_sold}</td>
      <td className="p-3">
        <div className="flex flex-col gap-1 items-start">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status_label]}`}>
            {t(`page_products.status_${p.status_label}`, statusLabels[p.status_label])}
          </span>
          {p.is_oversell && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t('page_products.oversell_badge')}</span>
          )}
        </div>
      </td>
      <td className="p-3 relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
        >
          {t('page_products.manage_button')} <IconChevronDown />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
              <Link to={`/products/${p.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <IconPencil /> {t('common.edit')}
              </Link>
              <button onClick={toggleActive} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left">
                {p.is_active ? t('page_products.deactivate') : t('page_products.activate')}
              </button>
              <button onClick={handleDelete} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-50 w-full text-left">
                <IconTrash /> {t('common.delete')}
              </button>
            </div>
          </>
        )}
        {error && <p className="text-[11px] text-red-600 mt-1 max-w-[160px]">{error}</p>}
      </td>
    </tr>
  )
}

export default function Products() {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState(new Set())
  const [bulkStock, setBulkStock] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState('')
  const [importing, setImporting] = useState(false)

  function reload() {
    listProducts().then((data) => {
      setProducts(data)
      setLoading(false)
      setSelected(new Set())
    })
  }

  useEffect(reload, [])

  const activeCount = products.filter((p) => p.is_active).length
  const inactiveCount = products.length - activeCount

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (tab === 'active' && !p.is_active) return false
      if (tab === 'inactive' && p.is_active) return false
      if (search) {
        const q = search.toLowerCase()
        const matchesName = p.name.toLowerCase().includes(q)
        const matchesSku = p.variants.some((v) => v.sku.toLowerCase().includes(q))
        if (!matchesName && !matchesSku) return false
      }
      return true
    })
  }, [products, tab, search])

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))))
  }

  function selectedProducts() {
    return products.filter((p) => selected.has(p.id))
  }

  async function applyBulkStock() {
    if (bulkStock === '' || selected.size === 0) return
    const value = Number(bulkStock)
    setBulkBusy(true)
    setBulkResult('')
    const calls = []
    for (const p of selectedProducts()) {
      for (const v of p.variants) {
        calls.push(updateVariant(p.id, v.id, {
          sku: v.sku, color: v.color, size: v.size, price: v.price,
          compare_at_price: v.compare_at_price, cost_price: v.cost_price,
          available_stock: value, broken_stock: v.broken_stock, reserve_stock: v.reserve_stock,
          incoming_stock: v.incoming_stock, minimum_stock: v.minimum_stock,
        }))
      }
    }
    const results = await Promise.allSettled(calls)
    const fail = results.filter((r) => r.status === 'rejected').length
    setBulkResult(fail > 0
      ? t('page_products.bulk_variant_result', { success: results.length - fail, fail })
      : t('page_products.bulk_stock_applied', { value, count: results.length }))
    setBulkStock('')
    setBulkBusy(false)
    reload()
  }

  async function applyBulkPrice() {
    if (bulkPrice === '' || selected.size === 0) return
    const isPercent = bulkPrice.trim().endsWith('%')
    const num = Number(bulkPrice.replace('%', ''))
    setBulkBusy(true)
    setBulkResult('')
    const calls = []
    for (const p of selectedProducts()) {
      for (const v of p.variants) {
        const newPrice = isPercent ? Math.round(v.price * (1 + num / 100)) : num
        calls.push(updateVariant(p.id, v.id, {
          sku: v.sku, color: v.color, size: v.size, price: newPrice,
          compare_at_price: v.compare_at_price, cost_price: v.cost_price,
          available_stock: v.available_stock, broken_stock: v.broken_stock, reserve_stock: v.reserve_stock,
          incoming_stock: v.incoming_stock, minimum_stock: v.minimum_stock,
        }))
      }
    }
    const results = await Promise.allSettled(calls)
    const fail = results.filter((r) => r.status === 'rejected').length
    setBulkResult(fail > 0
      ? t('page_products.bulk_variant_result', { success: results.length - fail, fail })
      : t('page_products.bulk_price_updated', { count: results.length }))
    setBulkPrice('')
    setBulkBusy(false)
    reload()
  }

  async function applyBulkCategory() {
    if (!bulkCategory || selected.size === 0) return
    setBulkBusy(true)
    setBulkResult('')
    const results = await Promise.allSettled(
      selectedProducts().map((p) => updateProduct(p.id, { name: p.name, description: p.description, brand: p.brand, category: bulkCategory, is_active: p.is_active }))
    )
    const fail = results.filter((r) => r.status === 'rejected').length
    setBulkResult(fail > 0
      ? t('page_products.bulk_product_result', { success: results.length - fail, fail })
      : t('page_products.bulk_category_updated', { count: results.length }))
    setBulkCategory('')
    setBulkBusy(false)
    reload()
  }

  async function applyBulkActive(isActive) {
    setBulkBusy(true)
    setBulkResult('')
    const results = await Promise.allSettled(
      selectedProducts().map((p) => updateProduct(p.id, { name: p.name, description: p.description, category: p.category, brand: p.brand, is_active: isActive }))
    )
    const fail = results.filter((r) => r.status === 'rejected').length
    setBulkResult(fail > 0
      ? t('page_products.bulk_product_result', { success: results.length - fail, fail })
      : t('page_products.bulk_active_updated', { count: results.length, action: isActive ? t('page_products.activated_word') : t('page_products.deactivated_word') }))
    setBulkBusy(false)
    reload()
  }

  async function applyBulkDelete() {
    setBulkBusy(true)
    setBulkResult('')
    const results = await Promise.allSettled(selectedProducts().map((p) => deleteProduct(p.id)))
    const fail = results.filter((r) => r.status === 'rejected').length
    setBulkResult(fail > 0
      ? t('page_products.bulk_delete_partial', { success: results.length - fail, fail })
      : t('page_products.bulk_delete_success', { count: results.length }))
    setBulkBusy(false)
    reload()
  }

  function exportCsv() {
    const rows = products.flatMap((p) => p.variants.map((v) => ({
      name: p.name, category: p.category, brand: p.brand, sku: v.sku, color: v.color, size: v.size,
      price: v.price, available_stock: v.available_stock, is_active: p.is_active,
    })))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importCsv(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const calls = results.data.map((row) => createProduct({
          name: row.name, category: row.category || '', brand: row.brand || '', images: [],
          variants: [{
            sku: row.sku || `${(row.name || 'SKU').slice(0, 6).toUpperCase()}-${Date.now()}`,
            color: row.color || '', size: row.size || '',
            price: Number(row.price) || 0, compare_at_price: 0, cost_price: 0,
            available_stock: Number(row.available_stock) || 0, broken_stock: 0, reserve_stock: 0,
            incoming_stock: 0, minimum_stock: 0,
          }],
        }))
        const settled = await Promise.allSettled(calls)
        const fail = settled.filter((r) => r.status === 'rejected').length
        setBulkResult(fail > 0
          ? t('page_products.import_partial', { success: settled.length - fail, fail })
          : t('page_products.import_success', { count: settled.length }))
        setImporting(false)
        reload()
      },
    })
    e.target.value = ''
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
        <button onClick={exportCsv} className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
          {t('page_products.export_csv')}
        </button>
        <label className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer">
          {importing ? t('page_products.importing') : t('page_products.import_csv')}
          <input type="file" accept=".csv" onChange={importCsv} className="hidden" disabled={importing} />
        </label>
        <button
          onClick={() => setBulkResult(t('page_products.excel_coming_soon'))}
          className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50"
        >
          {t('page_products.import_export_excel')}
        </button>
        <Link to="/products/new" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          + {t('page_products.add_product')}
        </Link>
      </div>

      {selected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-3 mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-brand-800">{t('page_products.selected_count', { count: selected.size })}</span>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} placeholder={t('page_products.stock_placeholder')} className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={applyBulkStock} disabled={bulkStock === '' || bulkBusy} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {t('page_products.set_stock')}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder={t('page_products.price_placeholder')} className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={applyBulkPrice} disabled={bulkPrice === '' || bulkBusy} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {t('page_products.update_price')}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder={t('page_products.new_category_placeholder')} className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={applyBulkCategory} disabled={!bulkCategory || bulkBusy} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {t('page_products.change_category')}
            </button>
          </div>
          <button onClick={() => applyBulkActive(true)} disabled={bulkBusy} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50">
            {t('page_products.activate')}
          </button>
          <button onClick={() => applyBulkActive(false)} disabled={bulkBusy} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50">
            {t('page_products.deactivate')}
          </button>
          <button onClick={applyBulkDelete} disabled={bulkBusy} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
            {t('common.delete')}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">
            {t('common.cancel')}
          </button>
        </div>
      )}
      {bulkResult && <p className="text-sm text-gray-600 mb-4">{bulkResult}</p>}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex gap-6 px-5 pt-4 border-b border-gray-100">
          {[
            ['all', t('page_products.tab_all', { count: products.length })],
            ['active', t('page_products.tab_active', { count: activeCount })],
            ['inactive', t('page_products.tab_inactive', { count: inactiveCount })],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-semibold border-b-2 ${
                tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 border-b border-gray-100">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('page_products.search_placeholder')}
            className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {loading ? (
          <p className="text-gray-500 py-10 text-center">{t('page_products.loading_products')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">{t('page_products.no_products')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase border-b">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="p-3">{t('page_products.col_info')}</th>
                  <th className="p-3">{t('page_products.col_price')}</th>
                  <th className="p-3">{t('page_products.col_stock')}</th>
                  <th className="p-3">{t('page_products.col_sales')}</th>
                  <th className="p-3">{t('page_products.col_status')}</th>
                  <th className="p-3">{t('page_products.manage_button')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <ProductRow key={p.id} p={p} onChanged={reload} selected={selected.has(p.id)} onToggleSelect={toggleSelect} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

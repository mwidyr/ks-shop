import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProducts, updateVariant, getStockHistory } from '../api/products'
import BigStatCard from '../components/BigStatCard'

function VariantRow({ product, variant, onSaved }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(variant)
  const [saving, setSaving] = useState(false)
  const lowStock = variant.minimum_stock > 0 && variant.available_stock <= variant.minimum_stock
  const isOversell = variant.available_stock < 0

  async function save() {
    setSaving(true)
    try {
      await updateVariant(product.id, variant.id, {
        sku: variant.sku, color: variant.color, size: variant.size, price: variant.price,
        compare_at_price: variant.compare_at_price, cost_price: variant.cost_price,
        available_stock: Number(form.available_stock), broken_stock: Number(form.broken_stock),
        reserve_stock: Number(form.reserve_stock), incoming_stock: Number(form.incoming_stock),
        minimum_stock: Number(form.minimum_stock),
      })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className={`hover:bg-gray-50 ${isOversell ? 'bg-red-50/50' : lowStock ? 'bg-yellow-50/50' : ''}`}>
      <td className="p-3">
        <p className="font-medium text-gray-800">{product.name}</p>
        <p className="text-xs text-gray-500">{variant.sku} · {variant.color}/{variant.size}</p>
      </td>
      {['available_stock', 'reserve_stock', 'broken_stock', 'incoming_stock', 'minimum_stock'].map((field) => (
        <td key={field} className="p-3 text-center">
          {editing ? (
            <input
              type="number" value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
            />
          ) : (
            <span className={field === 'available_stock' && isOversell ? 'text-red-600 font-bold' : field === 'available_stock' && lowStock ? 'text-yellow-700 font-bold' : ''}>{variant[field]}</span>
          )}
        </td>
      ))}
      <td className="p-3 text-center">{variant.order_stock}</td>
      <td className="p-3 text-center font-semibold">{variant.total_stock}</td>
      <td className="p-3 text-center">
        {isOversell && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t('page_inventory.oversell_badge')}</span>}
        {!isOversell && lowStock && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{t('page_inventory.low_stock_badge')}</span>}
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end">
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:underline">{t('common.save')}</button>
            <button onClick={() => { setEditing(false); setForm(variant) }} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600 hover:underline">{t('common.edit')}</button>
        )}
      </td>
    </tr>
  )
}

function StockHistoryTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getStockHistory({ q: search }).then((data) => { setRows(data); setLoading(false) })
  }, [search])

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('page_inventory.search_placeholder')}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      />
      {loading ? (
        <p className="text-gray-500 py-10 text-center">{t('page_inventory.loading_history')}</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-500">{t('page_inventory.no_history')}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {rows.map((r, i) => {
            const isIn = r.bucket_to === 'available_stock' || r.bucket_to === 'order_stock'
            return (
              <div key={i} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isIn ? t('page_inventory.stock_in') : t('page_inventory.stock_out')}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.product_name} <span className="font-mono text-xs text-gray-400">{r.sku}</span></p>
                    <p className="text-xs text-gray-500">{r.color}/{r.size} · {r.event_type} · {t('page_inventory.by', { name: r.changed_by })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${isIn ? 'text-green-600' : 'text-red-600'}`}>{isIn ? '+' : '-'}{r.qty}</p>
                  <p className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleString('id-ID')}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Inventory() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('current')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  function reload() {
    listProducts().then((data) => {
      setProducts(data)
      setLoading(false)
    })
  }

  useEffect(reload, [])

  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })))
  const lowStockCount = allVariants.filter(({ variant }) => variant.minimum_stock > 0 && variant.available_stock <= variant.minimum_stock).length
  const oversellCount = allVariants.filter(({ variant }) => variant.available_stock < 0).length
  const totalAvailable = allVariants.reduce((sum, { variant }) => sum + variant.available_stock, 0)
  const totalOrdered = allVariants.reduce((sum, { variant }) => sum + variant.order_stock, 0)

  const filtered = allVariants.filter(({ product, variant }) => {
    if (!search) return true
    const q = search.toLowerCase()
    return product.name.toLowerCase().includes(q) || variant.sku.toLowerCase().includes(q)
  })

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex flex-wrap gap-4 mb-6">
        <BigStatCard title={t('page_inventory.actual_stock')} value={totalAvailable} iconBg="bg-green-50" iconColor="text-green-600" icon="📦" />
        <BigStatCard title={t('page_inventory.ordered_stock')} value={totalOrdered} iconBg="bg-blue-50" iconColor="text-blue-600" icon="🚚" />
        <BigStatCard title={t('page_inventory.low_stock_badge')} value={lowStockCount} iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="⚠️" />
        <BigStatCard title={t('page_inventory.oversell_variants')} value={oversellCount} iconBg="bg-red-50" iconColor="text-red-600" icon="🔴" />
      </div>

      <div className="flex gap-2 mb-4">
        {[['current', t('page_inventory.tab_current')], ['history', t('page_inventory.tab_history')]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm font-medium px-4 py-1.5 rounded-full border ${tab === key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <StockHistoryTab />
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('page_inventory.search_placeholder')}
              className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {loading ? (
            <p className="text-gray-500 py-10 text-center">{t('page_inventory.loading_inventory')}</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase border-b">
                    <th className="p-3">{t('page_inventory.col_product_sku')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_available')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_reserved')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_damaged')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_incoming')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_min_stock')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_ordered')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_total')}</th>
                    <th className="p-3 text-center">{t('page_inventory.col_alert')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(({ product, variant }) => (
                    <VariantRow key={variant.id} product={product} variant={variant} onSaved={reload} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

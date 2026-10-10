import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProductColorPair } from '../api/reports'
import { listProducts } from '../api/products'
import { listHosts } from '../api/hosts'
import { listAffiliates } from '../api/affiliates'
import { presetRange } from '../components/DateRangePicker'
import PeriodPicker from '../components/PeriodPicker'
import SalesChannelFilter from '../components/SalesChannelFilter'
import ProductSearchBox from '../components/ProductSearchBox'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses, Metric } from '../components/Table'
import { IconChevronDown } from '../components/icons'
import { useMasterData } from '../context/MasterDataContext'

function PairedProductRow({ row, t }) {
  const [open, setOpen] = useState(false)
  const { translateColor } = useMasterData()
  return (
    <div className="border-b border-[var(--table-divider)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[var(--table-row-hover)]"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{row.name}</p>
          <p className="text-xs text-[var(--text-secondary)] font-mono">{row.sku}</p>
        </div>
        <div className="text-right shrink-0">
          <Metric type="ord" className="text-sm">{row.order_count}</Metric>
          <p className="text-[11px] text-[var(--text-secondary)]">{row.pct.toFixed(1)}%</p>
        </div>
        <IconChevronDown width={16} height={16} className={`text-[var(--text-secondary)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <table className={`${tableClasses} border-t border-[var(--table-divider)]`}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-2 pl-6">{t('page_product_color_pair.col_color_a')}</th>
              <th className="p-2">{t('page_product_color_pair.col_color_b')}</th>
              <th className="p-2">{t('page_product_performance.col_order_count')}</th>
              <th className="p-2">{t('page_product_performance.col_pct')}</th>
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {(row.color_pairs || []).map((p, i) => (
              <tr key={i} className={rowClasses}>
                <td className="p-2 pl-6 font-medium text-[var(--text-primary)]">{translateColor(p.color_a)}</td>
                <td className="p-2 font-medium text-[var(--text-primary)]">{translateColor(p.color_b)}</td>
                <td className="p-2"><Metric type="ord">{p.order_count}</Metric></td>
                <td className="p-2 text-[var(--text-secondary)]">{p.pct.toFixed(1)}%</td>
              </tr>
            ))}
            {(row.color_pairs || []).length === 0 && (
              <tr><td colSpan={4} className="p-4 pl-6 text-center text-[var(--text-secondary)]">{t('page_product_performance.no_combo')}</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Product Combo Analysis (item 010, renamed from "Color Pair Analysis" per item 016): pick one
// product and every other product that shares an order with it is auto-ranked by order count -
// no manual "Product B" step. Each ranked partner expands to its own color-A x color-B
// breakdown, powered by the backend's productColorPairAuto (reports.go).
export default function ProductColorPair() {
  const { t } = useTranslation()
  const [range, setRange] = useState(presetRange(29))
  const [products, setProducts] = useState([])
  const [skuA, setSkuA] = useState('')
  const [channel, setChannel] = useState('all')
  const [hostId, setHostId] = useState('')
  const [hosts, setHosts] = useState([])
  const [affiliateId, setAffiliateId] = useState('')
  const [affiliates, setAffiliates] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { listProducts().then(setProducts) }, [])
  useEffect(() => { listHosts(true).then(setHosts) }, [])
  useEffect(() => { listAffiliates().then(setAffiliates) }, [])

  useEffect(() => {
    if (!skuA) { setData(null); return }
    setLoading(true)
    getProductColorPair({
      sku_a: skuA, date_from: range.from, date_to: range.to,
      channel, host_id: channel === 'live' ? hostId : '',
      affiliate_id: channel === 'website' ? affiliateId : '',
    })
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => { setData(null); setLoading(false) })
  }, [skuA, range, channel, hostId, affiliateId])

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className={`${cardClasses} p-4 space-y-3`}>
        <SalesChannelFilter
          channel={channel} onChannelChange={setChannel}
          hostId={hostId} onHostChange={setHostId} hosts={hosts}
          affiliateId={affiliateId} onAffiliateChange={setAffiliateId} affiliates={affiliates}
        />
        <PeriodPicker value={range} onChange={setRange} defaultPreset="30d" />
        <ProductSearchBox products={products} sku={skuA} onPick={setSkuA} placeholder={t('page_product_color_pair.pick_product_a')} />
      </div>

      {!skuA ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('page_product_color_pair.empty_pick_products')}</div>
      ) : loading || !data ? (
        <div className={`${cardClasses} p-12 text-center text-[var(--text-secondary)]`}>{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_color_pair.product_a')}</p>
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{data.product_a.name}</p>
              <p className="text-xs text-[var(--text-secondary)] font-mono">{data.product_a.sku}</p>
            </div>
            <div className={`${cardClasses} p-4`}>
              <p className="text-[11px] uppercase text-[var(--text-secondary)] mb-1">{t('page_product_color_pair.shared_orders')}</p>
              <Metric type="ord" className="text-lg">{data.total_orders}</Metric>
            </div>
          </div>

          <div className={`${cardClasses} overflow-hidden`}>
            <div className="p-5 pb-3">
              <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_product_color_pair.title')}</h2>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_product_color_pair.hint')}</p>
            </div>
            {data.paired_products.length === 0 ? (
              <p className="p-6 text-center text-[var(--text-secondary)]">{t('page_product_color_pair.no_paired_products')}</p>
            ) : (
              data.paired_products.map((row) => <PairedProductRow key={row.sku} row={row} t={t} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

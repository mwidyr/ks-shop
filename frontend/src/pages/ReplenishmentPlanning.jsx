import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listReplenishment, saveReplenishmentSettings } from '../api/replenishment'
import { listSuppliers } from '../api/suppliers'
import { resolveUrl } from '../utils/image'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'
import ImagePreviewModal from '../components/ImagePreviewModal'
import { IconChevronDown } from '../components/icons'
import { useMasterData } from '../context/MasterDataContext'

const DEFAULTS = { stockout_days: 7, restock_days: 28, stagnant_days: 14 }
const ALERT_OPTIONS = ['all_alerts', 'stockout', 'restock', 'stagnant', 'overdue', 'normal', 'all']
const SORT_OPTIONS = ['risk', 'coverage', 'sales7', 'sales30']

// One colour per alert type; text colours stay readable on both light and dark themes.
const alertStyle = {
  stockout: { text: 'text-red-500', bg: 'bg-red-500/10', icon: '!' },
  restock: { text: 'text-amber-500', bg: 'bg-amber-500/10', icon: '◔' },
  stagnant: { text: 'text-violet-400', bg: 'bg-violet-500/10', icon: '▣' },
  overdue: { text: 'text-sky-400', bg: 'bg-sky-500/10', icon: '▤' },
}

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString())

function coverageText(c) { return c == null ? '—' : `${Number(c).toFixed(1)}d` }
function coverageColor(alerts = []) {
  if (alerts.includes('stockout')) return 'text-red-500'
  if (alerts.includes('restock')) return 'text-amber-500'
  return 'text-emerald-500'
}

function AlertCard({ type, count, t, settings }) {
  const s = alertStyle[type]
  const days = { stockout: settings.stockout_days, restock: settings.restock_days, stagnant: settings.stagnant_days }[type]
  return (
    <div className={`${cardClasses} p-4 flex items-center gap-3`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${s.bg} ${s.text}`}>{s.icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{t(`page_replenishment.alert_${type}`)}</p>
        <p className="text-2xl font-bold text-[var(--text-primary)] leading-tight">{count}</p>
        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">{t(`page_replenishment.card_${type}_desc`, { days })}</p>
      </div>
    </div>
  )
}

function AlertTags({ alerts = [], t }) {
  return (
    <span className="flex flex-wrap gap-x-2 text-[11px] font-medium">
      {alerts.map((a) => <span key={a} className={alertStyle[a].text}>{t(`page_replenishment.alert_${a}`)}</span>)}
    </span>
  )
}

function SettingsRow({ type, t, children }) {
  const s = alertStyle[type]
  return (
    <div className="py-4 border-b border-[var(--table-divider)] last:border-0">
      <p className={`font-semibold flex items-center gap-2 ${s.text}`}><span>{s.icon}</span> <span className="text-[var(--text-primary)]">{t(`page_replenishment.alert_${type}`)}</span></p>
      {children}
    </div>
  )
}

export default function ReplenishmentPlanning() {
  const { t } = useTranslation()
  const { translateColor } = useMasterData()
  const [suppliers, setSuppliers] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // debounced search
  const [supplierId, setSupplierId] = useState('')
  const [alert, setAlert] = useState('all_alerts')
  const [sort, setSort] = useState('risk')
  const [expanded, setExpanded] = useState(null) // only one product open at a time
  const [previewImage, setPreviewImage] = useState(null)
  const [form, setForm] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { listSuppliers(true).then(setSuppliers) }, [])
  useEffect(() => { const id = setTimeout(() => setQuery(search), 250); return () => clearTimeout(id) }, [search])

  function load() {
    setLoading(true)
    return listReplenishment({ q: query, supplierId: supplierId || undefined, alert, sort })
      .then((d) => { setData(d); setLoading(false); return d })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [query, supplierId, alert, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data?.settings) setForm(data.settings) }, [data?.settings?.stockout_days, data?.settings?.restock_days, data?.settings?.stagnant_days]) // eslint-disable-line react-hooks/exhaustive-deps

  function resetFilters() { setSearch(''); setQuery(''); setSupplierId(''); setAlert('all_alerts'); setSort('risk'); setExpanded(null) }

  async function persist(values) {
    setSaving(true); setMsg(null)
    try {
      await saveReplenishmentSettings(values)
      await load() // cards and list update right after saving
      setMsg({ ok: true, text: t('page_replenishment.settings_saved') })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('page_replenishment.settings_failed') })
    } finally { setSaving(false) }
  }

  const num = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) }))
  const formValid = [form.stockout_days, form.restock_days, form.stagnant_days].every((v) => Number.isInteger(v) && v >= 1) && form.restock_days > form.stockout_days
  const settings = data?.settings || DEFAULTS
  const cards = data?.cards || { stockout: 0, restock: 0, stagnant: 0, overdue: 0 }
  const products = data?.products || []
  const inputCls = 'w-24 border border-gray-300 rounded-full px-3 py-1.5 text-sm bg-transparent'

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {['stockout', 'restock', 'stagnant', 'overdue'].map((a) => <AlertCard key={a} type={a} count={cards[a]} t={t} settings={settings} />)}
      </div>

      <div className={`${cardClasses} p-4 space-y-3`}>
        <label className="block text-xs text-[var(--text-secondary)]">
          {t('page_replenishment.search_label')}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page_replenishment.search_placeholder')}
            className="mt-1 w-full border border-gray-300 rounded-full px-4 py-2 text-sm bg-transparent text-[var(--text-primary)]"
          />
        </label>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block text-xs text-[var(--text-secondary)]">
            {t('page_replenishment.supplier_label')}
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-full px-3 py-2 text-sm bg-transparent text-[var(--text-primary)]">
              <option value="">{t('page_replenishment.all_suppliers')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            {t('page_replenishment.alert_status_label')}
            <select value={alert} onChange={(e) => setAlert(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-full px-3 py-2 text-sm bg-transparent text-[var(--text-primary)]">
              {ALERT_OPTIONS.map((o) => <option key={o} value={o}>{t(`page_replenishment.filter_${o}`)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            {t('page_replenishment.sort_label')}
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-full px-3 py-2 text-sm bg-transparent text-[var(--text-primary)]">
              {SORT_OPTIONS.map((o) => <option key={o} value={o}>{t(`page_replenishment.sort_${o}`)}</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-secondary)]">{t('page_replenishment.product_count', { count: products.length })}</p>
          <button onClick={resetFilters} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[var(--text-secondary)] hover:bg-gray-100">↺ {t('page_replenishment.reset')}</button>
        </div>

        <div className="overflow-x-auto">
          {loading && !data ? (
            <p className="text-center text-[var(--text-secondary)] py-8">{t('common.loading')}</p>
          ) : (
            <table className={`${tableClasses} min-w-[480px]`}>
              <thead>
                <tr className={theadRowClasses}>
                  <th className="p-2">{t('page_replenishment.col_product')}</th>
                  <th className="p-2 text-right">7D</th>
                  <th className="p-2 text-right">14D</th>
                  <th className="p-2 text-right">30D</th>
                  <th className="p-2 text-right">{t('page_replenishment.col_coverage')}</th>
                  <th className="p-2 w-8" />
                </tr>
              </thead>
              <tbody className={tbodyClasses}>
                {products.map((p) => {
                  const open = expanded === p.product_id
                  return (
                    <Fragment key={p.product_id}>
                      <tr className={`${rowClasses} cursor-pointer`} onClick={() => setExpanded(open ? null : p.product_id)}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {p.image_url ? (
                              <img src={resolveUrl(p.image_url)} onClick={(e) => { e.stopPropagation(); setPreviewImage(p.image_url) }} className="w-9 h-9 rounded-lg object-cover bg-gray-100 shrink-0 cursor-pointer" />
                            ) : <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />}
                            <div className="min-w-0">
                              <p className="font-semibold text-[var(--text-primary)]">{p.name}</p>
                              <p className="text-[11px] text-[var(--text-secondary)]">{p.sku}</p>
                              <AlertTags alerts={p.alerts} t={t} />
                            </div>
                          </div>
                        </td>
                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(p.sales_7d)}</td>
                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(p.sales_14d)}</td>
                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(p.sales_30d)}</td>
                        <td className={`p-2 text-right font-bold ${p.coverage == null ? 'text-[var(--text-secondary)]' : coverageColor(p.alerts)}`}>{coverageText(p.coverage)}</td>
                        <td className="p-2"><IconChevronDown width={14} height={14} className={`text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} /></td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="m-2 rounded-xl bg-black/5 p-3">
                              <div className="flex items-center justify-between mb-2 text-sm">
                                <span className="font-bold text-[var(--text-primary)]">{t('page_replenishment.color_details', { sku: p.sku })}</span>
                                <span className="text-xs text-[var(--text-secondary)]">{p.supplier_name}</span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className={`${tableClasses} min-w-[640px]`}>
                                  <thead>
                                    <tr className={theadRowClasses}>
                                      <th className="p-2">{t('page_replenishment.col_color_status')}</th>
                                      <th className="p-2 text-right">7D</th><th className="p-2 text-right">14D</th><th className="p-2 text-right">30D</th>
                                      <th className="p-2 text-right">{t('page_replenishment.col_available')}</th>
                                      <th className="p-2 text-right">{t('page_replenishment.col_share')}</th>
                                      <th className="p-2 text-right">{t('page_replenishment.col_coverage')}</th>
                                    </tr>
                                  </thead>
                                  <tbody className={tbodyClasses}>
                                    {p.variants.map((v) => (
                                      <tr key={v.variant_id}>
                                        <td className="p-2">
                                          <p className="font-medium text-[var(--text-primary)]">{translateColor(v.color) || '—'}{v.size ? ` / ${v.size}` : ''}</p>
                                          {v.alerts.length > 0 ? (
                                            <span className="flex flex-wrap gap-x-2 text-[11px] font-medium">
                                              {v.alerts.map((a) => (
                                                <span key={a} className={alertStyle[a].text}>
                                                  {t(`page_replenishment.alert_${a}`)}
                                                  {a === 'stagnant' && v.days_without_sales != null ? ` · ${t('page_replenishment.days_no_sales', { n: v.days_without_sales })}` : ''}
                                                  {a === 'overdue' ? ` · ${t('page_replenishment.days_overdue', { n: v.overdue_days })}` : ''}
                                                </span>
                                              ))}
                                            </span>
                                          ) : <span className="text-[11px] text-emerald-500">{t('page_replenishment.filter_normal')}</span>}
                                        </td>
                                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(v.sales_7d)}</td>
                                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(v.sales_14d)}</td>
                                        <td className="p-2 text-right text-[var(--text-primary)]">{fmtNum(v.sales_30d)}</td>
                                        <td className="p-2 text-right font-semibold text-[var(--text-primary)]">{fmtNum(v.available)}</td>
                                        <td className="p-2 text-right text-[var(--text-secondary)]">{v.share_pct == null ? '—' : `${v.share_pct.toFixed(1)}%`}</td>
                                        <td className={`p-2 text-right font-bold ${v.coverage == null ? 'text-[var(--text-secondary)]' : coverageColor(v.alerts)}`}>{coverageText(v.coverage)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] mt-2">{t('page_replenishment.coverage_note')}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {products.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-[var(--text-secondary)]">{t('page_replenishment.empty_state')}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={`${cardClasses} p-4`}>
        <h2 className="font-bold text-[var(--text-primary)]">{t('page_replenishment.settings_title')}</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-1">{t('page_replenishment.settings_subtitle')}</p>
        <SettingsRow type="stockout" t={t}>
          <p className="text-xs text-[var(--text-secondary)] my-1">{t('page_replenishment.stockout_desc')}</p>
          <div className="flex items-center gap-2"><input type="number" min="1" value={form.stockout_days} onChange={num('stockout_days')} className={inputCls} /><span className="text-sm text-[var(--text-secondary)]">{t('page_replenishment.days')}</span></div>
        </SettingsRow>
        <SettingsRow type="restock" t={t}>
          <p className="text-xs text-[var(--text-secondary)] my-1">{t('page_replenishment.restock_desc')}</p>
          <div className="flex items-center gap-2"><input type="number" min="1" value={form.restock_days} onChange={num('restock_days')} className={inputCls} /><span className="text-sm text-[var(--text-secondary)]">{t('page_replenishment.days')}</span></div>
        </SettingsRow>
        <SettingsRow type="stagnant" t={t}>
          <p className="text-xs text-[var(--text-secondary)] my-1">{t('page_replenishment.stagnant_desc')}</p>
          <div className="flex items-center gap-2"><input type="number" min="1" value={form.stagnant_days} onChange={num('stagnant_days')} className={inputCls} /><span className="text-sm text-[var(--text-secondary)]">{t('page_replenishment.consecutive_days')}</span></div>
        </SettingsRow>
        <SettingsRow type="overdue" t={t}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-secondary)] my-1">{t('page_replenishment.overdue_desc')}</p>
            <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-[var(--table-divider)] text-[var(--text-secondary)]">{t('page_replenishment.automatic')}</span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">{t('page_replenishment.no_manual_config')}</p>
        </SettingsRow>
        {form.restock_days <= form.stockout_days && <p className="text-xs text-red-500 mt-2">{t('page_replenishment.invalid_order')}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={() => persist(form)} disabled={saving || !formValid} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">{t('page_replenishment.save_settings')}</button>
          <button onClick={() => { setForm(DEFAULTS); persist(DEFAULTS) }} disabled={saving} className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 text-[var(--text-secondary)] hover:bg-gray-100 disabled:opacity-50">{t('page_replenishment.reset_defaults')}</button>
          {msg && <span className={`text-xs font-semibold ${msg.ok ? 'text-emerald-500' : 'text-red-500'}`}>{msg.text}</span>}
        </div>
      </div>
      {previewImage && <ImagePreviewModal images={[{ url: previewImage }]} onClose={() => setPreviewImage(null)} />}
    </div>
  )
}

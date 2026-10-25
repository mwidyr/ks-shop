import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getWebsiteAnalytics } from '../api/websiteAnalytics'
import PeriodPicker, { useSharedRange } from '../components/PeriodPicker'
import { tableClasses, theadRowClasses, tbodyClasses, rowClasses, cardClasses } from '../components/Table'

const nf = (n) => Math.round(n || 0).toLocaleString('id-ID')
const dur = (s) => `${Math.floor((s || 0) / 60)}m ${String(Math.round((s || 0) % 60)).padStart(2, '0')}s`

function Kpi({ label, value }) {
  return (
    <div className={`${cardClasses} p-4`}>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</div>
    </div>
  )
}

function Table({ title, head, rows, empty }) {
  return (
    <div className={`${cardClasses} p-5 overflow-x-auto`}>
      <h2 className="font-bold text-[var(--text-primary)] mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">{empty}</p> : (
        <table className={tableClasses}>
          <thead><tr className={theadRowClasses}>{head.map((h, i) => <th key={h} className={`p-2 ${i > 0 && i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody className={tbodyClasses}>{rows.map((r) => <tr key={r.key} className={rowClasses}>{r.cells.map((c, i) => <td key={i} className={`p-2 ${i === r.cells.length - 1 ? 'text-right font-semibold' : ''}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  )
}

// Website traffic from Google Analytics 4 (#147): totals, where visitors come from, product page views by Product
// Code, and SEO article views, for the Date Filter range shared with the other analytics pages.
export default function WebsiteAnalytics() {
  const { t } = useTranslation()
  const [range, setRange] = useSharedRange()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let off = false
    setData(null); setFailed(false)
    getWebsiteAnalytics({ from: range.from, to: range.to }).then((d) => { if (!off) setData(d) }).catch(() => { if (!off) setFailed(true) })
    return () => { off = true }
  }, [range.from, range.to])

  const o = data?.overview
  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{t('page_website_analytics.title')}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t('page_website_analytics.intro')}</p>
        </div>
        <PeriodPicker shared value={range} onChange={setRange} />
      </div>

      {failed && <div className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700">{t('page_website_analytics.load_failed')}</div>}
      {!data && !failed && <div className="text-[var(--text-secondary)]">{t('page_website_analytics.loading')}</div>}
      {data && !data.configured && (
        <div className={`${cardClasses} p-6 space-y-2`} data-testid="ga-not-connected">
          <h2 className="font-bold text-[var(--text-primary)]">{t('page_website_analytics.not_connected')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{t('page_website_analytics.not_connected_hint')}</p>
          <code className="block text-xs bg-gray-100 rounded-lg p-3 whitespace-pre-wrap">GA4_MEASUREMENT_ID=G-XXXXXXXXXX{'\n'}GA4_PROPERTY_ID=123456789{'\n'}GA4_SERVICE_ACCOUNT_JSON={'{…}'}</code>
        </div>
      )}
      {data?.configured && data.error && <div className="text-sm px-4 py-2 rounded-lg bg-amber-50 text-amber-800">{t('page_website_analytics.unavailable')}</div>}
      {data?.configured && !data.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-testid="ga-kpis">
            <Kpi label={t('page_website_analytics.users')} value={nf(o.users)} />
            <Kpi label={t('page_website_analytics.new_users')} value={nf(o.new_users)} />
            <Kpi label={t('page_website_analytics.sessions')} value={nf(o.sessions)} />
            <Kpi label={t('page_website_analytics.page_views')} value={nf(o.page_views)} />
            <Kpi label={t('page_website_analytics.avg_session')} value={dur(o.avg_session_seconds)} />
            <Kpi label={t('page_website_analytics.engagement')} value={`${(o.engagement_rate * 100).toFixed(1)}%`} />
          </div>
          <Table title={t('page_website_analytics.sources')} empty={t('page_website_analytics.no_data')}
            head={[t('page_website_analytics.col_channel'), t('page_website_analytics.users'), t('page_website_analytics.sessions')]}
            rows={data.sources.map((s) => ({ key: s.channel, cells: [s.channel, nf(s.users), nf(s.sessions)] }))} />
          <Table title={t('page_website_analytics.products')} empty={t('page_website_analytics.no_data')}
            head={[t('page_website_analytics.col_code'), t('page_website_analytics.col_product'), t('page_website_analytics.col_views')]}
            rows={data.products.map((p) => ({ key: p.product_id, cells: [<span className="font-mono">{p.code}</span>, p.name, nf(p.views)] }))} />
          <Table title={t('page_website_analytics.articles')} empty={t('page_website_analytics.no_data')}
            head={[t('page_website_analytics.col_article'), t('page_website_analytics.col_views')]}
            rows={data.articles.map((a) => ({ key: a.slug, cells: [a.title, nf(a.views)] }))} />
        </>
      )}
    </div>
  )
}

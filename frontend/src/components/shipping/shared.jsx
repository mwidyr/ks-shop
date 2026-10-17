import { useTranslation } from 'react-i18next'

// The three shipping providers (pickup_chains.chain_type) and their URL slugs.
export const PROVIDERS = {
  cvs_711: { slug: '711', nameKey: 'provider_711', accent: 'border-orange-300 bg-orange-50 text-orange-700' },
  cvs_familymart: { slug: 'familymart', nameKey: 'provider_familymart', accent: 'border-sky-300 bg-sky-50 text-sky-700' },
  courier: { slug: 'hct', nameKey: 'provider_hct', accent: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
}
export const PROVIDER_KEYS = Object.keys(PROVIDERS)
export const providerBySlug = (slug) => PROVIDER_KEYS.find((k) => PROVIDERS[k].slug === slug)
export const batchPath = (provider, id) => `/shipping-workbench/${PROVIDERS[provider].slug}/batches/${id}`

// "5h" / "3d" since an ISO time.
export function elapsed(iso) {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function formatDateTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const STAGE_STYLE = {
  pending_order_matching: 'bg-amber-100 text-amber-800',
  awaiting_3pl_shipment: 'bg-blue-100 text-blue-800',
  shipped_awaiting_completion: 'bg-purple-100 text-purple-800',
  closed: 'bg-green-100 text-green-800',
}

export function StagePill({ stage }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${STAGE_STYLE[stage] || 'bg-gray-100 text-gray-700'}`}>
      {t(`page_shipping_wb.stage_${stage}`)}
    </span>
  )
}

export function BatchStatusPill({ status }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${status === 'closed' ? 'bg-gray-200 text-gray-700' : 'bg-brand-50 text-brand-700 border border-brand-200'}`}>
      {t(`page_shipping_wb.batch_status_${status}`)}
    </span>
  )
}

// Order-status counts of a batch, each order counted under exactly one status.
export function ProgressChips({ counts }) {
  const { t } = useTranslation()
  const items = [
    ['new', counts.new, 'bg-gray-100 text-gray-700'],
    ['processing', counts.processing, 'bg-purple-100 text-purple-700'],
    ['ready_to_ship', counts.ready_to_ship, 'bg-teal-100 text-teal-700'],
    ['shipped', counts.shipped, 'bg-blue-100 text-blue-700'],
    ['completed', counts.completed, 'bg-green-100 text-green-700'],
    ['cancelled', counts.cancelled, 'bg-red-100 text-red-700'],
    ['returned', counts.returned, 'bg-orange-100 text-orange-700'],
  ].filter(([, n]) => n > 0)
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([key, n, cls]) => (
        <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
          {t(`page_shipping_wb.chip_${key}`)} {n}
        </span>
      ))}
    </div>
  )
}

export function SectionCard({ id, step, title, hint, tone, children }) {
  return (
    <section id={id} className={`rounded-2xl shadow-sm p-5 scroll-mt-20 ${tone === 'danger' ? 'bg-red-50/40 border border-red-200' : 'bg-white'}`}>
      <div className="flex items-start gap-3 mb-3">
        {step && (
          <span className="shrink-0 w-8 h-8 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center">{step}</span>
        )}
        <div>
          <h2 className="font-bold text-gray-800">{title}</h2>
          {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function Stat({ label, value, tone }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-800'
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2 min-w-[96px]">
      <p className="text-[11px] uppercase text-gray-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

export function Notice({ tone = 'info', children }) {
  const cls = tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800'
    : tone === 'bad' ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-blue-50 border-blue-200 text-blue-800'
  return <div className={`text-sm border rounded-lg px-3 py-2 ${cls}`}>{children}</div>
}

export const primaryBtn = 'bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg'
export const ghostBtn = 'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-sm font-semibold px-4 py-2 rounded-lg'

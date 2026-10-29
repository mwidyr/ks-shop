import { useTranslation } from 'react-i18next'
import { useAccess } from '../context/AccessContext'

// Sales Channel Attribution (items 040-045): ALL / LIVE / Website segmented control. Selecting
// LIVE reveals the page's own Location/Host selects (passed in, since each page already has its
// own list source); selecting Website reveals the Affiliate select. Any select whose list prop
// is omitted is simply not rendered, so pages that don't have e.g. a Location filter can still
// use this component for just the channel toggle + Affiliate select.
// requireLocation (Product pages): the Host select stays disabled until a Location is picked, lists
// only that Location's hosts, and changing the Location resets the Host to "All Hosts".
const INDENT = '\u00A0\u00A0\u00A0\u00A0'

export default function SalesChannelFilter({
  channel, onChannelChange,
  locationId, onLocationChange, locations,
  hostId, onHostChange, hosts,
  affiliateId, onAffiliateChange, affiliates,
  requireLocation = false,
}) {
  const { t } = useTranslation()
  // A Host account only ever sees its own LIVE numbers (the server pins channel and host): nothing to filter.
  if (useAccess().role === 'host') return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {['all', 'live', 'website'].map((c) => (
          <button
            key={c}
            onClick={() => onChannelChange(c)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${channel === c ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
          >
            {t(`shared.sales_channel_${c}`)}
          </button>
        ))}
      </div>
      {channel === 'live' && locations && onLocationChange && (
        <select value={locationId || ''} onChange={(e) => { onLocationChange(e.target.value); if (requireLocation && onHostChange) onHostChange('') }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_performance_dashboard.all_locations')}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      {channel === 'live' && hosts && onHostChange && (
        <select value={hostId || ''} onChange={(e) => onHostChange(e.target.value)} disabled={requireLocation && !locationId} title={requireLocation && !locationId ? t('page_order_create.select_location_first') : undefined} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400">
          <option value="">{t('page_product_analytics.all_hosts')}</option>
          {(requireLocation ? (locationId ? hosts.filter((h) => String(h.location_id) === String(locationId)) : []) : hosts).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      )}
      {channel === 'website' && affiliates && onAffiliateChange && (
        <select value={affiliateId ?? ''} onChange={(e) => onAffiliateChange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          {/* Website > (All Website | All Affiliates) > individual sources / affiliates */}
          <option value="">{t('shared.all_website')}</option>
          <option value="cs">{INDENT}{t('shared.website_created_by_cs')}</option>
          <option value="self_service">{INDENT}{t('shared.website_self_service')}</option>
          <option value="affiliates">{t('shared.all_affiliates')}</option>
          {affiliates.map((a) => <option key={a.id} value={a.id}>{INDENT}{a.name}</option>)}
        </select>
      )}
    </div>
  )
}

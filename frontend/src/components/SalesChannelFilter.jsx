import { useTranslation } from 'react-i18next'

// Sales Channel Attribution (items 040-045): ALL / LIVE / Website segmented control. Selecting
// LIVE reveals the page's own Location/Host selects (passed in, since each page already has its
// own list source); selecting Website reveals the Affiliate select. Any select whose list prop
// is omitted is simply not rendered, so pages that don't have e.g. a Location filter can still
// use this component for just the channel toggle + Affiliate select.
export default function SalesChannelFilter({
  channel, onChannelChange,
  locationId, onLocationChange, locations,
  hostId, onHostChange, hosts,
  affiliateId, onAffiliateChange, affiliates,
}) {
  const { t } = useTranslation()
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
        <select value={locationId || ''} onChange={(e) => onLocationChange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_performance_dashboard.all_locations')}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      {channel === 'live' && hosts && onHostChange && (
        <select value={hostId || ''} onChange={(e) => onHostChange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('page_product_analytics.all_hosts')}</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      )}
      {channel === 'website' && affiliates && onAffiliateChange && (
        <select value={affiliateId ?? ''} onChange={(e) => onAffiliateChange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">{t('shared.all_affiliates')}</option>
          <option value="none">{t('shared.no_affiliate')}</option>
          {affiliates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
    </div>
  )
}

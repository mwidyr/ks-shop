import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'

const campaigns = [
  { nameKey: 'campaign_flash_sale', channelKey: 'channel_in_app', reach: '12.400', endsKey: 'ends_in_days', endsCount: 2 },
  { nameKey: 'campaign_live_weekend', channel: 'TikTok Live', reach: '8.200', endsKey: 'ends_ongoing' },
]

export default function Campaigns() {
  const { t } = useTranslation()
  return (
    <MockPage icon="🎯" title={t('page_campaigns.title')} description={t('page_campaigns.description')}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {campaigns.map((c) => (
          <div key={c.nameKey} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{t(`page_campaigns.${c.nameKey}`)}</p>
              <p className="text-xs text-gray-500">
                {c.channelKey ? t(`page_campaigns.${c.channelKey}`) : c.channel} · {t('page_campaigns.reach_label', { reach: c.reach })}
              </p>
            </div>
            <span className="text-xs font-semibold text-gray-500">
              {c.endsKey === 'ends_in_days' ? t('page_campaigns.ends_in_days', { count: c.endsCount }) : t(`page_campaigns.${c.endsKey}`)}
            </span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

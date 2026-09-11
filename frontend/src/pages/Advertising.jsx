import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'
import BigStatCard from '../components/BigStatCard'

export default function Advertising() {
  const { t } = useTranslation()
  return (
    <MockPage icon="📢" title={t('page_advertising.title')} description={t('page_advertising.description')}>
      <div className="flex flex-wrap gap-4">
        <BigStatCard title={t('page_advertising.stat_ad_spend')} value="NT$1,250" iconBg="bg-blue-50" iconColor="text-blue-600" icon="💰" />
        <BigStatCard title={t('page_advertising.stat_impressions')} value="45.200" iconBg="bg-purple-50" iconColor="text-purple-600" icon="👁️" />
        <BigStatCard title={t('page_advertising.stat_clicks')} value="1.840" iconBg="bg-green-50" iconColor="text-green-600" icon="🖱️" />
        <BigStatCard title={t('page_advertising.stat_roas')} value="3.2x" iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="📈" />
      </div>
    </MockPage>
  )
}

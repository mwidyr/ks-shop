import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'

const integrations = [
  { name: 'WhatsApp Business', descKey: 'desc_whatsapp_business', connected: true },
  { name: 'Telegram Bot', descKey: 'desc_telegram_bot', connected: false },
  { name: 'Google Sheets', descKey: 'desc_google_sheets', connected: false },
  { name: 'Meta Ads', descKey: 'desc_meta_ads', connected: false },
]

export default function Integrations() {
  const { t } = useTranslation()
  return (
    <MockPage icon="🔌" title={t('page_integrations.title')} description={t('page_integrations.description', { brand: t('brand.name') })}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {integrations.map((i) => (
          <div key={i.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{i.name}</p>
              <p className="text-xs text-gray-500">{t(`page_integrations.${i.descKey}`)}</p>
            </div>
            <button className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
              i.connected ? 'bg-green-50 text-green-700' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
              {i.connected ? t('page_integrations.status_connected') : t('page_integrations.action_connect')}
            </button>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

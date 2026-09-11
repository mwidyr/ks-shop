import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'

const promos = [
  { nameKey: 'promo_flash_99', typeKey: 'type_percentage', value: '10%', statusKey: 'status_active' },
  { nameKey: 'promo_free_shipping', typeKey: 'type_shipping', value: 'NT$15', statusKey: 'status_active' },
  { nameKey: 'promo_bundle_tshirt', typeKey: 'type_bundle', value: 'NT$50', statusKey: 'status_ended' },
]

export default function Promotions() {
  const { t } = useTranslation()
  return (
    <MockPage icon="🏷️" title={t('page_promotions.title')} description={t('page_promotions.description')}>
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {promos.map((p) => (
          <div key={p.nameKey} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{t(`page_promotions.${p.nameKey}`)}</p>
              <p className="text-xs text-gray-500">{t(`page_promotions.${p.typeKey}`)} · {p.value}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.statusKey === 'status_active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t(`page_promotions.${p.statusKey}`)}</span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

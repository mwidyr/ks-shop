import { useTranslation } from 'react-i18next'
import MockPage from '../components/MockPage'

export default function StoreDesign() {
  const { t } = useTranslation()
  return (
    <MockPage icon="🎨" title={t('page_store_design.title')} description={t('page_store_design.description')}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">{t('page_store_design.card_featured_title')}</p>
          <p className="text-xs text-gray-500">{t('page_store_design.card_featured_desc')}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">{t('page_store_design.card_collections_title')}</p>
          <p className="text-xs text-gray-500">{t('page_store_design.card_collections_desc')}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">{t('page_store_design.card_layout_title')}</p>
          <p className="text-xs text-gray-500">{t('page_store_design.card_layout_desc')}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">{t('page_store_design.card_categories_title')}</p>
          <p className="text-xs text-gray-500">{t('page_store_design.card_categories_desc')}</p>
        </div>
      </div>
    </MockPage>
  )
}

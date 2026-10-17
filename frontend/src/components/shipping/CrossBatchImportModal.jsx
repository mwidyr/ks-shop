import { useTranslation } from 'react-i18next'
import ImportBox from './ImportBox'

// Upload shipping records without opening the original batch. Rows are matched across ALL batches
// by whichever identifiers they carry (our order number, platform order number, shipping number);
// ambiguous or conflicting rows become Pending Issues instead of being applied by guessing.
export default function CrossBatchImportModal({ onClose, onDone }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">{t('page_shipping_wb.cross_batch_import')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500">{t('page_shipping_wb.cross_batch_desc')}</p>
        <ImportBox
          title={t('page_shipping_wb.cross_platform_title')}
          hint={t('page_shipping_wb.cross_platform_hint')}
          kinds={['711_validation', '711_export', 'fm_result']}
          onDone={onDone}
        />
        <ImportBox
          title={t('page_shipping_wb.cross_3pl_title')}
          hint={t('page_shipping_wb.cross_3pl_hint')}
          kinds={['3pl_shipment']}
        />
        <ImportBox
          title={t('page_shipping_wb.cross_delivery_title')}
          hint={t('page_shipping_wb.cross_delivery_hint')}
          kinds={['delivery']}
        />
      </div>
    </div>
  )
}

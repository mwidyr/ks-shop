import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { availablePromotions, updateOrderPromotions } from '../api/promotions'
import { describeError } from '../utils/errorText'
import OrderPromotionsPanel, { emptyPromotionState } from './OrderPromotionsPanel'
import { IconClose } from './icons'

// CS changes the promotions of an order that has not started processing (private offer, after-sales, compensation).
// The server decides them again with the same engine as Create Order; nothing is saved until "Save".
export default function EditPromotionsModal({ order, onClose, onDone }) {
  const { t } = useTranslation()
  const [state, setState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    availablePromotions(order.sales_channel).then((available) => {
      const applied = order.promotions || []
      const appliedIds = new Set(applied.map((p) => p.promotion_id))
      const gifts = {}
      for (const it of order.items || []) if (it.is_gift && it.gift_promotion_id) gifts[it.gift_promotion_id] = it.variant_id
      // a code typed when the order was made stays a code (valid on LIVE too); only the rest are picks from the list
      const typed = order.promotion_typed_code || ''
      const picks = applied.filter((p) => !p.auto_apply && !(typed && p.code === typed))
      setState({
        ...emptyPromotionState(),
        code: typed,
        promotionIds: picks.map((p) => p.promotion_id),
        excludedIds: available.filter((a) => a.auto_apply && !appliedIds.has(a.id)).map((a) => a.id),
        giftChoices: gifts,
        purposeId: String(picks.map((p) => p.purpose_id).find(Boolean) || ''),
      })
    }).catch(() => setState(emptyPromotionState()))
  }, [order])

  const needsPurpose = state ? state.promotionIds.length > 0 : false

  async function save() {
    setError('')
    if (needsPurpose && !state.purposeId) { setError(t('shared.promo_panel.purpose_placeholder')); return }
    setSaving(true)
    try {
      await updateOrderPromotions(order.id, {
        code: state.code, promotion_ids: state.promotionIds, excluded_promotion_ids: state.excludedIds,
        gift_choices: state.giftChoices, purpose_id: Number(state.purposeId) || 0,
      })
      onDone()
    } catch (e) {
      setError(describeError(e, t('page_order_detail.promo_edit_failed')))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">{t('page_order_detail.promo_edit_title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t('page_order_detail.promo_edit_hint')}</p>
        {state && <OrderPromotionsPanel orderId={order.id} salesChannel={order.sales_channel} state={state} onChange={setState} />}
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">{t('common.cancel')}</button>
          <button type="button" onClick={save} disabled={saving || !state} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">{t('page_order_detail.promo_edit_save')}</button>
        </div>
      </div>
    </div>
  )
}

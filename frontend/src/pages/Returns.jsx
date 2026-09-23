import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listReturns, createReturn, approveReturn, rejectReturn } from '../api/returns'
import { formatCurrency } from '../utils/format'

const stageKeys = ['submitted', 'reviewed', 'approved', 'item_received', 'inspection', 'refund']
const reasonKeys = ['damaged', 'wrong_item', 'missing_item', 'defective', 'change_of_mind']
const refundTypeKeys = ['full', 'replacement', 'store_credit']

const emptyForm = { order_no: '', reason: '', refund_type: 'full', qty: '', amount: '', note: '' }

function CreateReturnForm({ onCreate, onClose }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onCreate({
        order_no: form.order_no.trim(),
        reason: form.reason,
        refund_type: form.refund_type,
        qty: Number(form.qty) || 0,
        amount: Number(form.amount) || 0,
        note: form.note,
      })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('page_returns.error_create_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800 mb-4">{t('page_returns.create_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_order_no')}</label>
            <input value={form.order_no} onChange={(e) => setForm((s) => ({ ...s, order_no: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_reason')}</label>
            <select value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
              <option value="">{t('page_returns.option_choose_reason')}</option>
              {reasonKeys.map((r) => <option key={r} value={r}>{t(`page_returns.reason.${r}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_refund_type')}</label>
            <select value={form.refund_type} onChange={(e) => setForm((s) => ({ ...s, refund_type: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {refundTypeKeys.map((r) => <option key={r} value={r}>{t(`page_returns.refund_type.${r}`)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_qty')}</label>
              <input type="number" min="1" value={form.qty} onChange={(e) => setForm((s) => ({ ...s, qty: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_amount')}</label>
              <input type="number" min="0" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('page_returns.field_note')}</label>
            <textarea value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="bg-gray-800 hover:bg-black disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-full">
              {saving ? t('page_returns.saving') : t('page_returns.create_button')}
            </button>
            <button type="button" onClick={onClose} className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2 rounded-full hover:bg-gray-50">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Returns() {
  const { t } = useTranslation()
  const [returns, setReturns] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const stages = stageKeys.map((k) => t(`page_returns.stages.${k}`))

  function reload() {
    listReturns().then(setReturns)
  }

  useEffect(reload, [])

  async function handleApprove(ret) {
    setError('')
    try {
      await approveReturn(ret.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_returns.error_action_failed'))
    }
  }

  async function handleReject(ret) {
    setError('')
    try {
      await rejectReturn(ret.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_returns.error_action_failed'))
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={() => setShowCreate(true)} className="bg-gray-800 hover:bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {t('page_returns.new_return_button')}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {returns.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-400">
          {t('page_returns.empty_state')}
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((ret) => (
            <div key={ret.id} className={`bg-white rounded-2xl shadow-sm p-5 ${ret.status === 'rejected' ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">
                    RET-{String(ret.id).padStart(3, '0')} · {ret.order_no}
                    {ret.status === 'rejected' && (
                      <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{t('page_returns.status_rejected')}</span>
                    )}
                    {ret.status === 'completed' && (
                      <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t('page_returns.status_completed')}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{ret.customer_name} · {t('page_returns.reason_prefix')} {t(`page_returns.reason.${ret.reason}`)}</p>
                </div>
                <p className="font-semibold text-brand-600">{formatCurrency(ret.amount)}</p>
              </div>
              <div className="flex items-center gap-1 mb-3">
                {stages.map((s, i) => (
                  <div key={s} className="flex-1 flex items-center">
                    <div className={`flex-1 text-center text-[10px] font-semibold py-1.5 rounded-full ${
                      i < ret.stage ? 'bg-brand-600 text-white' : i === ret.stage - 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {s}
                    </div>
                    {i < stages.length - 1 && <div className={`w-2 h-0.5 shrink-0 ${i < ret.stage - 1 ? 'bg-brand-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{t('page_returns.refund_type_label')}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{t(`page_returns.refund_type.${ret.refund_type}`)}</span>
                {ret.status === 'active' && (
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => handleApprove(ret)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100">{t('page_returns.approve')}</button>
                    <button onClick={() => handleReject(ret)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">{t('page_returns.reject')}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateReturnForm onCreate={async (payload) => { await createReturn(payload); reload() }} onClose={() => setShowCreate(false)} />}
    </div>
  )
}

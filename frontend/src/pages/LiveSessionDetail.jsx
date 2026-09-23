import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getLiveSession, updateLiveSession, goLiveSession, endLiveSession,
  addLiveSessionProduct, removeLiveSessionProduct, submitLiveSessionData,
} from '../api/liveSessions'
import { listProducts } from '../api/products'
import { listHosts } from '../api/hosts'
import { formatCurrency } from '../utils/format'
import SessionStatusPill from '../components/SessionStatusPill'
import { IconClose, IconPlus, IconTrash } from '../components/icons'

function AddProductModal({ variants, onAdd, onClose }) {
  const { t } = useTranslation()
  const [variantId, setVariantId] = useState('')
  const [livePrice, setLivePrice] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!variantId || !livePrice) return
    setSaving(true)
    try {
      await onAdd(Number(variantId), Number(livePrice))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">{t('page_live_session_detail.modal_add_product_title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('page_live_session_detail.label_choose_product')}</label>
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4"
            required
          >
            <option value="">{t('page_live_session_detail.option_choose_product')}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.productName} — {v.color}/{v.size} ({v.sku})</option>
            ))}
          </select>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('page_live_session_detail.label_live_price')}</label>
          <input
            type="number" min="1"
            value={livePrice}
            onChange={(e) => setLivePrice(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-5"
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !variantId || !livePrice} className="bg-gray-800 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-5 py-2 rounded-full">
              {saving ? t('page_live_session_detail.adding') : t('common.add')}
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

const liveDataNumberFields = ['views', 'uv', 'active_viewers', 'pcu', 'follows', 'chats', 'shares', 'likes']

function emptyLiveDataForm(session) {
  const awtTotal = session.awt_seconds ?? 0
  return {
    views: session.views ?? '',
    uv: session.uv ?? '',
    active_viewers: session.active_viewers ?? '',
    awt_min: Math.floor(awtTotal / 60) || '',
    awt_sec: awtTotal % 60 || '',
    pcu: session.pcu ?? '',
    acu: session.acu ?? '',
    follows: session.follows ?? '',
    chats: session.chats ?? '',
    shares: session.shares ?? '',
    likes: session.likes ?? '',
  }
}

function LiveDataCard({ session, onSave }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => emptyLiveDataForm(session))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setForm(emptyLiveDataForm(session)), [session.id, session.live_data_recorded_at])

  function setField(key, value) {
    setForm((s) => ({ ...s, [key]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        views: Number(form.views) || 0,
        uv: Number(form.uv) || 0,
        active_viewers: Number(form.active_viewers) || 0,
        awt_seconds: (Number(form.awt_min) || 0) * 60 + (Number(form.awt_sec) || 0),
        pcu: Number(form.pcu) || 0,
        acu: Number(form.acu) || 0,
        follows: Number(form.follows) || 0,
        chats: Number(form.chats) || 0,
        shares: Number(form.shares) || 0,
        likes: Number(form.likes) || 0,
      })
    } catch (err) {
      setError(err.response?.data?.error || t('page_live_session_detail.live_data_save_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <p className="font-bold text-gray-800">{t('page_live_session_detail.live_data_title')}</p>
        {session.live_data_recorded_at ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {t('page_live_session_detail.live_data_recorded')}
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {t('page_live_session_detail.live_data_not_recorded')}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('page_live_session_detail.live_data_hint')}</p>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {liveDataNumberFields.map((key) => (
            <div key={key}>
              <label className="block text-[11px] text-gray-500 mb-1">{t(`page_live_session_detail.live_data_field_${key}`)}</label>
              <input
                type="number" min="0"
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_live_session_detail.live_data_field_awt')}</label>
            <div className="flex items-center gap-1">
              <input type="number" min="0" value={form.awt_min} onChange={(e) => setField('awt_min', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="m" />
              <span className="text-gray-400">:</span>
              <input type="number" min="0" max="59" value={form.awt_sec} onChange={(e) => setField('awt_sec', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="s" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{t('page_live_session_detail.live_data_field_acu')}</label>
            <input
              type="number" min="0" step="0.01"
              value={form.acu}
              onChange={(e) => setField('acu', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button type="submit" disabled={saving} className="bg-gray-800 hover:bg-black disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {saving ? t('page_live_session_detail.saving') : t('page_live_session_detail.live_data_save_button')}
        </button>
      </form>
    </div>
  )
}

export default function LiveSessionDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [cart, setCart] = useState([])
  const [variants, setVariants] = useState([])
  const [hosts, setHosts] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    getLiveSession(id).then((res) => {
      setSession(res.session)
      setCart(res.cart)
      setLabelDraft(res.session.label)
    })
  }

  useEffect(reload, [id])
  useEffect(() => {
    listHosts().then(setHosts)
    listProducts().then((products) => {
      setVariants(products.flatMap((p) => p.variants.map((v) => ({ ...v, productName: p.name }))))
    })
  }, [])

  async function saveLabel() {
    if (labelDraft.trim() && labelDraft !== session.label) {
      await updateLiveSession(id, { label: labelDraft.trim() })
      reload()
    }
    setEditingLabel(false)
  }

  async function setHost(hostId) {
    await updateLiveSession(id, { host_id: hostId })
    reload()
  }

  async function handleGoLive() {
    setError('')
    setBusy(true)
    try {
      await goLiveSession(id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_live_session_detail.error_start_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleEnd() {
    setBusy(true)
    try {
      await endLiveSession(id)
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function handleAddProduct(variantId, livePrice) {
    await addLiveSessionProduct(id, variantId, livePrice)
    reload()
  }

  async function handleRemoveProduct(cartItemId) {
    await removeLiveSessionProduct(id, cartItemId)
    reload()
  }

  async function handleSaveLiveData(payload) {
    await submitLiveSessionData(id, payload)
    reload()
  }

  if (!session) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">{t('common.loading')}</div>

  return (
    <div className="px-4 sm:px-6 py-6">
      <button onClick={() => navigate('/panel-siaran/history')} className="text-sm text-gray-500 hover:text-gray-800 mb-4">
        ← {t('page_live_session_detail.back_button')}
      </button>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-gray-800">{t('page_live_session_detail.label_session_info')}</p>
            <SessionStatusPill status={session.status} />
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('page_live_session_detail.label_session_name')}</p>
          {editingLabel ? (
            <div className="flex items-center gap-2 mb-4">
              <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onBlur={saveLabel} autoFocus className="border border-gray-300 rounded-lg px-2 py-1 text-lg font-bold flex-1" />
            </div>
          ) : (
            <p className="text-lg font-bold text-gray-800 mb-4">
              {session.label} <button onClick={() => setEditingLabel(true)} className="text-xs font-semibold text-brand-600 hover:underline align-middle ml-1">{t('common.edit')}</button>
            </p>
          )}

          <p className="text-xs text-gray-500 mb-1">{t('page_live_session_detail.label_host')}</p>
          {session.status === 'draft' ? (
            <select value={session.host_id || ''} onChange={(e) => setHost(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm mb-4 w-full">
              <option value="">{t('page_live_session_detail.option_choose_host')}</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : (
            <p className="text-sm font-semibold text-gray-700 mb-4">{session.host_name}</p>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">{t('page_live_session_detail.label_order_count')}</p>
              <p className="text-lg font-bold text-gray-800">{session.order_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('page_live_session_detail.label_peak_viewers')}</p>
              <p className="text-lg font-bold text-gray-800">{session.peak_viewers}</p>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {session.status === 'draft' && (
            <button onClick={handleGoLive} disabled={busy || !session.host_id} className="w-full bg-gray-800 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold py-2.5 rounded-full">
              {t('page_live_session_detail.start_broadcast_button')}
            </button>
          )}
          {session.status === 'live' && (
            <button onClick={handleEnd} disabled={busy} className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold py-2.5 rounded-full">
              {t('page_live_session_detail.end_broadcast_button')}
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="font-bold text-gray-800 mb-4">{t('page_live_session_detail.label_broadcast_console')}</p>
          {cart.length === 0 ? (
            <div className="border border-gray-200 rounded-xl py-4 text-center text-sm text-gray-400">
              {t('page_live_session_detail.hint_add_product_first')}
            </div>
          ) : (
            <p className="text-sm text-gray-600">{t('page_live_session_detail.cart_ready_summary', { count: cart.length })}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-800">{t('page_live_session_detail.cart_products_heading', { count: cart.length })}</h2>
        <button onClick={() => setModalOpen(true)} className="bg-gray-800 hover:bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
          <IconPlus width={14} height={14} /> {t('page_live_session_detail.add_product_button')}
        </button>
      </div>

      {cart.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm text-gray-400">
          {t('page_live_session_detail.empty_cart')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y">
          {cart.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">{c.product_name}</p>
                <p className="text-xs text-gray-500">{c.color}/{c.size} · <span className="font-mono">{c.sku}</span></p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-400 line-through">{formatCurrency(c.price)}</p>
                  <p className="text-sm font-bold text-brand-600">{formatCurrency(c.live_price)}</p>
                </div>
                <button onClick={() => handleRemoveProduct(c.id)} className="text-gray-400 hover:text-red-600">
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {session.status !== 'draft' && <LiveDataCard session={session} onSave={handleSaveLiveData} />}

      {modalOpen && <AddProductModal variants={variants} onAdd={handleAddProduct} onClose={() => setModalOpen(false)} />}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMergeSuggestions, createMergeGroup } from '../api/orders'

export default function MergeOrders() {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)
  const [doneKeys, setDoneKeys] = useState(new Set())
  // Per-suggestion set of selected order_ids - lets staff merge only some of a group's orders
  // (e.g. 2 out of 3) instead of always the whole suggested set. Defaults to "all selected" so
  // the one-click merge-everything flow still works unchanged if nothing is deselected.
  const [selectedByKey, setSelectedByKey] = useState({})

  function load() {
    setLoading(true)
    getMergeSuggestions().then((data) => {
      setSuggestions(data)
      setSelectedByKey(Object.fromEntries(
        data.map((s) => [`${s.customer_id}-${s.pickup_store_code}`, new Set(s.order_ids)])
      ))
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  function toggleOrder(key, orderId) {
    setSelectedByKey((prev) => {
      const next = new Set(prev[key])
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return { ...prev, [key]: next }
    })
  }

  async function handleMerge(suggestion, key) {
    const orderIds = [...(selectedByKey[key] || [])]
    if (orderIds.length < 2) return
    setBusyKey(key)
    try {
      await createMergeGroup(orderIds)
      setDoneKeys((s) => new Set(s).add(key))
      load()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{t('page_merge_orders.heading')}</h1>
          <p className="text-sm text-gray-500">{t('page_merge_orders.subheading')}</p>
        </div>
        <Link to="/orders" className="text-sm font-semibold text-brand-600 hover:underline">
          {t('page_merge_orders.back_to_orders')}
        </Link>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">{t('common.loading')}</p>
      ) : suggestions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">{t('page_merge_orders.empty')}</div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const key = `${s.customer_id}-${s.pickup_store_code}`
            const done = doneKeys.has(key)
            const selected = selectedByKey[key] || new Set()
            const canMerge = selected.size >= 2
            return (
              <div key={key} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-800">{s.customer_name}</p>
                    <p className="text-xs text-gray-500">{s.customer_phone} · {s.pickup_chain_name}{s.pickup_store_code && ` #${s.pickup_store_code}`}</p>
                  </div>
                  <button
                    onClick={() => handleMerge(s, key)}
                    disabled={busyKey === key || done || !canMerge}
                    title={!canMerge && !done ? t('page_merge_orders.select_at_least_two') : undefined}
                    className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shrink-0"
                  >
                    {done ? t('page_merge_orders.merged_label') : busyKey === key ? t('page_orders.merging') : t('page_merge_orders.merge_button', { count: selected.size })}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {s.order_nos.map((no, i) => {
                    const orderId = s.order_ids[i]
                    const checked = selected.has(orderId)
                    return (
                      <label
                        key={no}
                        className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-lg cursor-pointer ${checked ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 border border-transparent'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrder(key, orderId)}
                          disabled={done}
                          className="accent-amber-600"
                        />
                        {no}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

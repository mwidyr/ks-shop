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

  function load() {
    setLoading(true)
    getMergeSuggestions().then((data) => {
      setSuggestions(data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function handleMerge(suggestion, key) {
    setBusyKey(key)
    try {
      await createMergeGroup(suggestion.order_ids)
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
            return (
              <div key={key} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-800">{s.customer_name}</p>
                    <p className="text-xs text-gray-500">{s.customer_phone} · {s.pickup_chain_name}{s.pickup_store_code && ` #${s.pickup_store_code}`}</p>
                  </div>
                  <button
                    onClick={() => handleMerge(s, key)}
                    disabled={busyKey === key || done}
                    className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shrink-0"
                  >
                    {done ? t('page_merge_orders.merged_label') : busyKey === key ? t('page_orders.merging') : t('page_merge_orders.merge_button')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {s.order_nos.map((no) => (
                    <span key={no} className="text-xs font-mono px-2 py-1 rounded-lg bg-gray-100 text-gray-600">{no}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

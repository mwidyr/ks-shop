import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'

// Single field: search by name or phone. No separate "search"/"new customer" toggle - if
// nothing matches what's typed, small new-customer fields (name/phone/address) appear inline
// automatically. Emits the resolved payload via onChange:
//   existing: the full customer row from the search API (id, name, phone, address, plus
//             last_pickup_chain_id/last_pickup_store_name/last_pickup_store_code, so the
//             parent can auto-fill pickup method - only `id` is actually sent on order create)
//   new:      { name, phone, address }
export default function CustomerPicker({ onChange }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' })

  async function search(q) {
    setQuery(q)
    setSelected(null)
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      onChange(null)
      return
    }
    const res = await client.get(`/customers?q=${encodeURIComponent(q)}`)
    setResults(res.data)
    setSearched(true)
    if (res.data.length === 0) {
      const next = { ...newCustomer, name: q }
      setNewCustomer(next)
      onChange(next)
    } else {
      onChange(null)
    }
  }

  function pick(customer) {
    setSelected(customer)
    setResults([])
    setQuery(customer.name)
    onChange(customer)
  }

  function changeCustomer() {
    setSelected(null)
    setQuery('')
    setResults([])
    setSearched(false)
    onChange(null)
  }

  function updateNew(field, val) {
    const next = { ...newCustomer, [field]: val }
    setNewCustomer(next)
    onChange(next)
  }

  if (selected) {
    return (
      <div>
        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
              {selected.name}
              {selected.is_blacklisted && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                  {t('shared.customer_blacklist_badge')}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">{selected.phone}</p>
          </div>
          <button type="button" onClick={changeCustomer} className="text-xs font-semibold text-brand-600 hover:underline shrink-0">
            {t('shared.customer_change')}
          </button>
        </div>
        {selected.is_blacklisted && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mt-2">
            {t('shared.customer_blacklist_warning')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t('shared.customer_search_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
              >
                <p className="font-medium text-gray-800 flex items-center gap-1.5">
                  {c.name}
                  {c.is_blacklisted && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                      {t('shared.customer_blacklist_badge')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{c.phone}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {searched && results.length === 0 && (
        <div className="space-y-2 mt-2">
          <p className="text-xs text-gray-500">{t('shared.customer_new_hint')}</p>
          <input
            value={newCustomer.name}
            onChange={(e) => updateNew('name', e.target.value)}
            placeholder={t('shared.customer_name_placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newCustomer.phone}
            onChange={(e) => updateNew('phone', e.target.value)}
            placeholder={t('shared.customer_phone_placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newCustomer.address}
            onChange={(e) => updateNew('address', e.target.value)}
            placeholder={t('shared.customer_address_placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  )
}

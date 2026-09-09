import { useState } from 'react'
import client from '../api/client'

// Lets staff search an existing customer or quick-add a new one for a manual order.
// Emits the resolved customer payload via onChange:
//   existing: { id }
//   new:      { name, phone, address }
export default function CustomerPicker({ onChange }) {
  const [mode, setMode] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' })

  async function search(q) {
    setQuery(q)
    if (q.length < 2) {
      setResults([])
      return
    }
    const res = await client.get(`/customers?q=${encodeURIComponent(q)}`)
    setResults(res.data)
  }

  function pick(customer) {
    setSelected(customer)
    setResults([])
    setQuery(customer.name)
    onChange({ id: customer.id })
  }

  function updateNew(field, val) {
    const next = { ...newCustomer, [field]: val }
    setNewCustomer(next)
    onChange(next)
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setMode('search'); setSelected(null); onChange(null) }}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${mode === 'search' ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}
        >
          Cari Pelanggan
        </button>
        <button
          type="button"
          onClick={() => { setMode('new'); setSelected(null); onChange(newCustomer) }}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${mode === 'new' ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}
        >
          Pelanggan Baru
        </button>
      </div>

      {mode === 'search' ? (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Cari nama atau nomor HP..."
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
                  <p className="font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <p className="text-xs text-green-600 mt-1">Dipilih: {selected.name} · {selected.phone}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={newCustomer.name}
            onChange={(e) => updateNew('name', e.target.value)}
            placeholder="Nama pelanggan"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newCustomer.phone}
            onChange={(e) => updateNew('phone', e.target.value)}
            placeholder="Nomor HP"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newCustomer.address}
            onChange={(e) => updateNew('address', e.target.value)}
            placeholder="Alamat"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  )
}

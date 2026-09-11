import { useEffect, useState } from 'react'
import { listPickupLinks, createPickupLink, updatePickupLink } from '../api/pickupLinks'

const tabs = [
  { key: 'perlu_diproses', label: 'Perlu Diproses' },
  { key: 'menunggu_pilih', label: 'Menunggu Pilih' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'batal', label: 'Kedaluwarsa / Batal' },
]

const statusColors = {
  perlu_diproses: 'bg-yellow-100 text-yellow-700',
  menunggu_pilih: 'bg-blue-100 text-blue-700',
  selesai: 'bg-green-100 text-green-700',
  batal: 'bg-gray-100 text-gray-500',
  kedaluwarsa: 'bg-gray-100 text-gray-500',
}

export default function Shipping() {
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [lastLink, setLastLink] = useState(null)
  const [tab, setTab] = useState('perlu_diproses')
  const [search, setSearch] = useState('')
  const [links, setLinks] = useState([])
  const [copiedId, setCopiedId] = useState(null)

  function reload() {
    listPickupLinks({ status: tab, q: search }).then(setLinks)
  }

  useEffect(reload, [tab, search])

  async function handleCreate(e) {
    e.preventDefault()
    if (!label.trim()) return
    setCreating(true)
    try {
      const res = await createPickupLink({ label: label.trim() })
      setLastLink(`${window.location.origin}/pickup/${res.token}`)
      setLabel('')
      reload()
    } finally {
      setCreating(false)
    }
  }

  async function copyLink(id, token) {
    const url = `${window.location.origin}/pickup/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // clipboard API unavailable; ignore
    }
  }

  async function markStatus(id, status) {
    await updatePickupLink(id, status)
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-1">Buat Tautan Pickup</h2>
        <p className="text-xs text-gray-500 mb-3">Buat tautan yang bisa dibagikan, misalnya per host/sesi live.</p>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Contoh: Pelanggan Live Juni"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={creating} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            {creating ? 'Membuat...' : 'Buat Tautan'}
          </button>
        </form>
        {lastLink && (
          <div className="mt-3 flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg p-2">
            <input readOnly value={lastLink} className="flex-1 bg-transparent text-sm text-brand-800 font-mono outline-none" />
            <button onClick={() => navigator.clipboard.writeText(lastLink)} className="text-xs font-semibold text-brand-600 hover:underline">Salin</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">Daftar Tautan Pickup</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari label..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <div className="flex gap-2 overflow-x-auto mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 text-sm font-medium px-4 py-1.5 rounded-full border ${tab === t.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {links.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Belum ada tautan pickup.</p>
        ) : (
          <div className="divide-y">
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{l.label}</p>
                  <p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString('id-ID')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[l.status]}`}>{l.status}</span>
                  <button onClick={() => copyLink(l.id, l.token)} className="text-xs text-brand-600 hover:underline">
                    {copiedId === l.id ? 'Tersalin!' : 'Salin Tautan'}
                  </button>
                  {l.status !== 'selesai' && (
                    <button onClick={() => markStatus(l.id, 'selesai')} className="text-xs text-green-600 hover:underline">Selesai</button>
                  )}
                  {l.status !== 'batal' && (
                    <button onClick={() => markStatus(l.id, 'batal')} className="text-xs text-red-600 hover:underline">Batalkan</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

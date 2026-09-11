import { useEffect, useState } from 'react'
import { listHosts } from '../api/hosts'
import { listLiveSessions, startLiveSession, endLiveSession } from '../api/liveSessions'

export default function PanelSiaran() {
  const [hosts, setHosts] = useState([])
  const [hostId, setHostId] = useState('')
  const [label, setLabel] = useState('')
  const [sessions, setSessions] = useState([])
  const [starting, setStarting] = useState(false)

  useEffect(() => { listHosts().then(setHosts) }, [])

  function reload() {
    if (!hostId) { setSessions([]); return }
    listLiveSessions({ host_id: hostId }).then(setSessions)
  }

  useEffect(reload, [hostId])

  async function handleStart(e) {
    e.preventDefault()
    if (!hostId || !label.trim()) return
    setStarting(true)
    try {
      await startLiveSession(Number(hostId), label.trim())
      setLabel('')
      reload()
    } finally {
      setStarting(false)
    }
  }

  async function handleEnd(id) {
    await endLiveSession(id)
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">Mulai Sesi Live</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Host</label>
            <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Pilih host</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <form onSubmit={handleStart} className="flex gap-2 items-end">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Label Sesi</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Contoh: Live Sabtu Malam"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" disabled={!hostId || starting} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {starting ? 'Memulai...' : '▶ Mulai Sesi'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">Riwayat Sesi {hostId ? `- ${hosts.find((h) => String(h.id) === hostId)?.name || ''}` : ''}</h2>
        {!hostId ? (
          <p className="text-sm text-gray-400">Pilih host untuk melihat riwayat sesinya.</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada sesi untuk host ini.</p>
        ) : (
          <div className="divide-y">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{s.label}</p>
                  <p className="text-xs text-gray-500">Mulai {new Date(s.started_at).toLocaleString('id-ID')}</p>
                </div>
                {s.ended_at ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    Selesai {new Date(s.ended_at).toLocaleString('id-ID')}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Sedang Live</span>
                    <button onClick={() => handleEnd(s.id)} className="text-xs font-semibold text-red-600 hover:underline">Akhiri</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

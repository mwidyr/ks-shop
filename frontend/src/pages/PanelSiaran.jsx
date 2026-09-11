import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listHosts } from '../api/hosts'
import { listLiveSessions, createLiveSession, updateLiveSession, goLiveSession } from '../api/liveSessions'
import SessionStatusPill from '../components/SessionStatusPill'

export default function PanelSiaran() {
  const navigate = useNavigate()
  const [hosts, setHosts] = useState([])
  const [current, setCurrent] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    Promise.all([
      listLiveSessions({ status: 'draft' }),
      listLiveSessions({}),
    ]).then(([drafts, all]) => {
      setCurrent(drafts[0] || null)
      setTotal(all.length)
      setLoading(false)
    })
  }

  useEffect(() => { listHosts().then(setHosts) }, [])
  useEffect(reload, [])

  async function handlePickHost(host) {
    setError('')
    setBusy(true)
    try {
      if (current) {
        // already have a draft in progress: just attach/replace the host
        await updateLiveSession(current.id, { host_id: host.id })
      } else {
        await createLiveSession(`Live ${host.name}`, host.id)
      }
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function handleGoLive() {
    if (!current) return
    setError('')
    setBusy(true)
    try {
      await goLiveSession(current.id)
      navigate(`/panel-siaran/${current.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mulai siaran')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="px-4 sm:px-6 py-16 text-center text-gray-500">Memuat...</div>

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Konsol Siaran</h1>
        <Link to="/panel-siaran/history" className="text-sm text-gray-500 hover:text-brand-600">
          Riwayat Sesi ({total})
        </Link>
      </div>

      {current && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Akan Tayang</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-gray-800">{current.label}</p>
              <p className="text-xs text-gray-400 mb-2">{new Date(current.created_at).toLocaleString('id-ID')}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>🛒 Keranjang Live <span className="font-semibold">{current.cart_count}</span></span>
                <span>📋 Pesanan <span className="font-semibold">{current.order_count}</span></span>
              </div>
              <Link to={`/panel-siaran/${current.id}`} className="text-sm text-brand-600 font-semibold hover:underline mt-2 inline-block">
                Kelola Sesi →
              </Link>
            </div>
            <SessionStatusPill status={current.status} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Langkah 1 — Pilih Host</p>
        <div className="divide-y">
          {hosts.map((h) => (
            <button
              key={h.id}
              disabled={busy}
              onClick={() => handlePickHost(h)}
              className={`w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 disabled:opacity-50 ${current?.host_id === h.id ? 'bg-brand-50/50' : ''}`}
            >
              <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-600 font-semibold flex items-center justify-center shrink-0">
                {h.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-gray-800">{h.name}</span>
              {current?.host_id === h.id && <span className="ml-auto text-xs font-semibold text-brand-600">Terpilih</span>}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Langkah 2 — Mulai Siaran</p>
          <button
            onClick={handleGoLive}
            disabled={busy || !current.host_id}
            className="w-full bg-gray-800 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            📡 Mulai Siaran
          </button>
          {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
          <p className="text-xs text-gray-400 mt-2 text-center">
            {current.host_id ? 'Pastikan keranjang live sudah diisi sebelum mulai siaran.' : 'Pilih host terlebih dahulu.'}
          </p>
        </div>
      )}
    </div>
  )
}

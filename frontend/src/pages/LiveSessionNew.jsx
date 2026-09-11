import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createLiveSession } from '../api/liveSessions'

export default function LiveSessionNew() {
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await createLiveSession(label.trim())
      navigate(`/panel-siaran/${res.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal membuat sesi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Tambah Sesi Siaran</h1>
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nama Sesi *</label>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Contoh: Siaran Malam 4/15"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !label.trim()} className="bg-gray-800 hover:bg-black disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
            {saving ? 'Menyimpan...' : 'Buat Sesi'}
          </button>
          <Link to="/panel-siaran/history" className="border border-gray-300 text-gray-600 text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-50">
            Batal
          </Link>
        </div>
      </form>
    </div>
  )
}

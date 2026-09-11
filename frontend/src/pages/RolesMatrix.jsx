import { useEffect, useState } from 'react'
import { listUsers, createUser, updateUser } from '../api/users'

const roleOptions = [
  { key: 'super_user', label: 'Super User' },
  { key: 'management', label: 'Management' },
  { key: 'spv', label: 'SPV' },
  { key: 'sales', label: 'Sales' },
]

const permissions = [
  { name: 'Produk & Stok', access: { super_user: true, management: true, spv: false, sales: false } },
  { name: 'Pesanan', access: { super_user: true, management: true, spv: true, sales: true } },
  { name: 'Pengaturan Toko', access: { super_user: true, management: true, spv: false, sales: false } },
  { name: 'Laporan & Profit', access: { super_user: true, management: true, spv: true, sales: false } },
  { name: 'Manajemen Pengguna', access: { super_user: true, management: false, spv: false, sales: false } },
]

function AddStaffForm({ onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('sales')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setTempPassword('')
    try {
      const res = await createUser({ name, email, role })
      setTempPassword(res.temp_password)
      setName('')
      setEmail('')
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menambah staf')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end mb-4">
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Nama</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Peran</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50">
        {saving ? 'Menambah...' : '+ Tambah Staf'}
      </button>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      {tempPassword && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 w-full">
          Akun dibuat. Password sementara (catat sekarang, tidak ditampilkan lagi): <span className="font-mono font-bold">{tempPassword}</span>
        </p>
      )}
    </form>
  )
}

export default function RolesMatrix() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  function reload() {
    listUsers().then((data) => { setUsers(data); setLoading(false) })
  }

  useEffect(reload, [])

  async function toggleActive(u) {
    await updateUser(u.id, { is_active: !u.is_active })
    reload()
  }

  async function changeRole(u, role) {
    await updateUser(u.id, { role })
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">Staf</h2>
        <AddStaffForm onCreated={reload} />
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : (
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                    {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                  <button onClick={() => toggleActive(u)} className="text-xs font-semibold text-brand-600 hover:underline">
                    {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-1">Matriks Izin</h2>
        <p className="text-xs text-gray-500 mb-4">Referensi tetap (belum ada kontrol izin granular per-modul) - mengikuti 4 peran yang benar-benar dipakai sistem.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">Modul</th>
              {roleOptions.map((r) => <th key={r.key} className="p-2 text-center">{r.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {permissions.map((p) => (
              <tr key={p.name}>
                <td className="p-2 font-medium text-gray-700">{p.name}</td>
                {roleOptions.map((r) => (
                  <td key={r.key} className="p-2 text-center">
                    {p.access[r.key] ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">✕</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

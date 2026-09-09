import { useEffect, useState } from 'react'
import { listHosts, createHost, updateHost, deleteHost } from '../api/hosts'
import { listCouriers, createCourier, updateCourier, deleteCourier } from '../api/couriers'
import { getFeeSettings, updateFeeSettings } from '../api/settings'

function FeeSettingsCard() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { getFeeSettings().then(setForm) }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await updateFeeSettings({
        platform_fee_pct: Number(form.platform_fee_pct),
        payment_fee_pct: Number(form.payment_fee_pct),
        shipping_subsidy_flat: Number(form.shipping_subsidy_flat),
        ad_cost_flat: Number(form.ad_cost_flat),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!form) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 md:col-span-2">
      <h2 className="font-bold text-gray-800 mb-1">Asumsi Biaya</h2>
      <p className="text-xs text-gray-500 mb-4">Dipakai untuk menghitung Profit Analytics — bukan integrasi payment/ads asli.</p>
      <form onSubmit={save} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Platform Fee (%)</label>
          <input type="number" step="0.1" value={form.platform_fee_pct} onChange={(e) => update('platform_fee_pct', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Payment Fee (%)</label>
          <input type="number" step="0.1" value={form.payment_fee_pct} onChange={(e) => update('payment_fee_pct', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Shipping Subsidy / order</label>
          <input type="number" value={form.shipping_subsidy_flat} onChange={(e) => update('shipping_subsidy_flat', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Ad Cost / order</label>
          <input type="number" value={form.ad_cost_flat} onChange={(e) => update('ad_cost_flat', e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="col-span-2 md:col-span-4 flex items-center gap-3">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
          {saved && <span className="text-xs text-green-600">Tersimpan</span>}
        </div>
      </form>
    </div>
  )
}

function ReferenceTable({ title, items, fields, onCreate, onUpdate, onDelete, reload }) {
  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, '']))
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await onCreate(form)
      setForm(emptyForm)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menyimpan')
    }
  }

  async function toggleActive(item) {
    await onUpdate(item.id, { ...item, is_active: !item.is_active })
    reload()
  }

  async function handleDelete(item) {
    setError('')
    try {
      await onDelete(item.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menghapus')
    }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  }

  async function handleBulkDelete() {
    setError('')
    setBulkBusy(true)
    const results = await Promise.allSettled([...selected].map((id) => onDelete(id)))
    const fail = results.filter((r) => r.status === 'rejected').length
    if (fail > 0) setError(`${results.length - fail} berhasil dihapus, ${fail} dilewati (masih digunakan di order)`)
    setSelected(new Set())
    setBulkBusy(false)
    reload()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">{title}</h2>
        {items.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={selected.size === items.length} onChange={toggleSelectAll} />
            Pilih semua
          </label>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-brand-50 border border-brand-200 rounded-lg p-2">
          <span className="text-xs font-medium text-brand-800">{selected.size} dipilih</span>
          <button onClick={handleBulkDelete} disabled={bulkBusy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
            {bulkBusy ? 'Menghapus...' : 'Hapus Terpilih'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">Batal</button>
        </div>
      )}

      <div className="divide-y mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
              <div>
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                {item.platform && <p className="text-xs text-gray-500">{item.platform}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {item.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
              <button onClick={() => toggleActive(item)} className="text-xs text-brand-600 hover:underline">
                {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button onClick={() => handleDelete(item)} className="text-xs text-red-600 hover:underline">
                Hapus
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400 py-4">Belum ada data.</p>}
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
            <input
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              required={f.required}
            />
          </div>
        ))}
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
          Tambah
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

export default function Settings() {
  const [hosts, setHosts] = useState([])
  const [couriers, setCouriers] = useState([])

  function reload() {
    listHosts(true).then(setHosts)
    listCouriers(true).then(setCouriers)
  }

  useEffect(() => { reload() }, [])

  return (
    <div className="px-4 sm:px-6 py-6 grid md:grid-cols-2 gap-6 items-start">
      <ReferenceTable
        title="Host Live"
        items={hosts}
        fields={[
          { key: 'name', label: 'Nama Host', required: true },
          { key: 'platform', label: 'Platform' },
        ]}
        onCreate={createHost}
        onUpdate={updateHost}
        onDelete={deleteHost}
        reload={reload}
      />

      <ReferenceTable
        title="Kurir Pengiriman"
        items={couriers}
        fields={[{ key: 'name', label: 'Nama Kurir', required: true }]}
        onCreate={createCourier}
        onUpdate={updateCourier}
        onDelete={deleteCourier}
        reload={reload}
      />

      <FeeSettingsCard />
    </div>
  )
}

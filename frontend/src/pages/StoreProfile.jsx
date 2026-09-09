import { useState } from 'react'

export default function StoreProfile() {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    name: 'KS Shop', description: 'Toko fashion & aksesoris terpercaya sejak 2024.',
    url: 'ksshop.mystore.id', category: 'Fashion & Aksesoris',
    instagram: '@ksshop.id', tiktok: '@ksshop.live',
  })

  function save(e) {
    e.preventDefault()
    setToast('Fitur simpan profil toko akan segera hadir')
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      {toast && <div className="mb-4 text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg">{toast}</div>}
      <form onSubmit={save} className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Profil Toko</h2>
          <div className="flex gap-4 items-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Logo</div>
            <div className="flex-1 h-20 rounded-2xl bg-gradient-to-r from-brand-100 to-brand-50 flex items-center justify-center text-gray-400 text-xs">Banner Toko</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Toko</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Toko</label>
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Toko</label>
              <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Social Links</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
              <input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TikTok</label>
              <input value={form.tiktok} onChange={(e) => setForm((f) => ({ ...f, tiktok: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg">
          Simpan
        </button>
      </form>
    </div>
  )
}

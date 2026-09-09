import { useState } from 'react'
import { resolveUrl, uploadImageFile } from '../utils/image'

const MAX_PHOTOS = 5
const slotLabels = ['Foto Utama', 'Foto 2', 'Foto 3', 'Foto 4', 'Foto 5']

// Up to 5 photo slots: value = array of {id?, url}. onAdd(url)/onRemove(image, index) let the
// caller decide whether to just update local state (create flow) or fire an API call
// immediately (edit flow).
export default function PhotoSlots({ value = [], onAdd, onRemove }) {
  const [uploadingSlot, setUploadingSlot] = useState(null)
  const [error, setError] = useState('')

  async function handleFile(e, slotIndex) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploadingSlot(slotIndex)
    try {
      const url = await uploadImageFile(file)
      onAdd(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal upload gambar')
    } finally {
      setUploadingSlot(null)
      e.target.value = ''
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const image = value[i]
          const wajib = i === 0
          if (image) {
            return (
              <div key={i} className="w-28 text-center">
                <div className="w-28 h-28 rounded-xl bg-gray-100 overflow-hidden border border-gray-200 relative group">
                  <img src={resolveUrl(image.url)} alt={slotLabels[i]} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemove(image, i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">{slotLabels[i]}</p>
              </div>
            )
          }
          const disabled = i > value.length
          return (
            <div key={i} className="w-28 text-center">
              <label
                className={`w-28 h-28 rounded-xl border-2 border-dashed flex items-center justify-center text-[11px] ${
                  disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-pointer hover:border-brand-400 hover:text-brand-500'
                }`}
              >
                {uploadingSlot === i ? '...' : '+ Tambah'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={disabled || uploadingSlot !== null}
                  onChange={(e) => handleFile(e, i)}
                />
              </label>
              <p className="text-[11px] text-gray-500 mt-1">{slotLabels[i]}{wajib ? ' *' : ''}</p>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Format .jpg .jpeg .png, maksimal 5 foto. Foto Utama wajib diisi.</p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

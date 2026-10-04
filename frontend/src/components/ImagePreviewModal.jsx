import { useState } from 'react'
import { resolveUrl } from '../utils/image'
import { IconClose, IconChevronDown } from './icons'

// Full-screen photo preview opened from a product thumbnail (item 047) - no navigation, no
// reload, just a quick look. Cycles through every photo on the product when there's more than
// one. Closes on the X button or a click outside the image itself.
export default function ImagePreviewModal({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const photos = images.filter((img) => img?.url)
  if (photos.length === 0) return null
  const current = photos[Math.min(index, photos.length - 1)]

  function prev(e) {
    e.stopPropagation()
    setIndex((i) => (i - 1 + photos.length) % photos.length)
  }
  function next(e) {
    e.stopPropagation()
    setIndex((i) => (i + 1) % photos.length)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <IconClose width={28} height={28} />
      </button>
      <div className="relative max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <img src={resolveUrl(current.url)} className="max-w-full max-h-[85vh] rounded-xl object-contain" />
        {photos.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
              <IconChevronDown width={18} height={18} className="rotate-90" />
            </button>
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
              <IconChevronDown width={18} height={18} className="-rotate-90" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

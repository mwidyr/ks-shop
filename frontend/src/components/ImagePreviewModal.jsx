import { useEffect, useRef, useState } from 'react'
import { resolveUrl } from '../utils/image'
import { IconClose, IconChevronDown } from './icons'

// Full-screen photo preview opened from a thumbnail (item 047, #137) - no new tab, no reload, just
// a quick look. Cycles through every photo when there's more than one. Closes on the X button (top
// right), a click outside the image, Esc, or the phone's / browser's Back button (the preview adds
// one history entry, so Back returns to the screen underneath instead of leaving the page).
let openCount = 0

export default function ImagePreviewModal({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const closedByBack = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const mine = ++openCount
    // React StrictMode mounts twice in development: the entry from the first mount is still there
    if (!window.history.state?.imagePreview) window.history.pushState({ imagePreview: true }, '')
    const onPop = () => { closedByBack.current = true; onCloseRef.current() }
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      // closed by X / Esc / outside click: drop the history entry the preview added - unless this
      // was StrictMode's throw-away mount (another preview mounted right after)
      setTimeout(() => {
        if (openCount === mine && !closedByBack.current && window.history.state?.imagePreview) window.history.back()
      }, 0)
    }
  }, [])

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
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close"
        className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
        <IconClose width={24} height={24} />
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

import { useState } from 'react'
import { resolveUrl } from '../utils/image'
import ImagePreviewModal from './ImagePreviewModal'

// An uploaded image that opens the in-page preview overlay when tapped (#137), instead of doing
// nothing or opening a new browser tab. className styles the <img> itself.
export default function PreviewableImage({ url, alt = '', className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="contents cursor-zoom-in">
        <img src={resolveUrl(url)} alt={alt} className={`${className} cursor-zoom-in`} />
      </button>
      {open && <ImagePreviewModal images={[{ url }]} onClose={() => setOpen(false)} />}
    </>
  )
}

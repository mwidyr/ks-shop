import { resolveUrl } from '../utils/image'
import { IconClose } from './icons'

// One uploaded image as a thumbnail (#137): tapping it opens the in-page preview (onPreview) instead
// of a new browser tab, and the X in its corner removes it (onDelete, omitted = no X). Works the
// same with touch: the X is always visible, not only on hover.
export default function AttachmentThumb({ url, onPreview, onDelete, deleteLabel = 'Remove', className = 'w-16 h-16', children }) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <button type="button" onClick={onPreview} className="block w-full h-full rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
        <img src={resolveUrl(url)} alt="" className="w-full h-full object-cover" />
      </button>
      {children}
      {onDelete && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label={deleteLabel} title={deleteLabel}
          className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-900/80 text-white flex items-center justify-center shadow hover:bg-red-600 after:absolute after:-inset-2 after:content-['']">
          <IconClose width={14} height={14} />
        </button>
      )}
    </div>
  )
}

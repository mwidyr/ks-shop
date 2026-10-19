import { useEffect, useRef, useState } from 'react'
import { listContentTags } from '../../api/website'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../../utils/hooks'

export const MAX_TAGS = 30
export const MAX_TAG_LENGTH = 60

// Free-text tags: Enter adds the typed text as a chip (long-tail keywords and multi-word phrases are fine), each chip can
// be removed, and tags used on other articles are suggested while typing. Nothing is restricted to a list.
export default function TagInput({ value = [], onChange, placeholder = '', hint = '' }) {
  const [text, setText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS)
  const reqId = useRef(0)

  useEffect(() => {
    const id = ++reqId.current
    if (!open) return
    listContentTags(debounced.trim()).then((list) => { if (id === reqId.current) setSuggestions(list) }).catch(() => {})
  }, [debounced, open])

  const lower = new Set(value.map((x) => x.toLowerCase()))
  function add(raw) {
    const tag = String(raw || '').replace(/\s+/g, ' ').replace(/^#/, '').trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || lower.has(tag.toLowerCase()) || value.length >= MAX_TAGS) { setText(''); return }
    onChange([...value, tag])
    setText('')
  }
  const shown = suggestions.filter((s) => !lower.has(s.toLowerCase())).slice(0, 8)

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 bg-white">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
            {tag}
            <button type="button" aria-label={`remove ${tag}`} onClick={() => onChange(value.filter((x) => x !== tag))} className="text-gray-400 hover:text-red-600">×</button>
          </span>
        ))}
        <input
          value={text} placeholder={value.length ? '' : placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text) }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
      {open && shown.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
          {shown.map((s) => (
            <li key={s}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">{s}</button></li>
          ))}
        </ul>
      )}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

import { useState } from 'react'

function parseList(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

// Multi-select-style tag editor backed by a single comma-separated string (same convention
// ProductForm.jsx already uses for Colors/Sizes) - renders removable pills plus a small input
// to add new ones. Used for Supplier Category (item 036).
export default function TagsInput({ value, onChange, placeholder }) {
  const [text, setText] = useState('')
  const tags = parseList(value || '')

  function addTag() {
    const next = parseList(text)
    if (next.length === 0) return
    const merged = [...new Set([...tags, ...next])]
    onChange(merged.join(', '))
    setText('')
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag).join(', '))
  }

  return (
    <div className="border border-gray-300 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5 rounded-full">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="text-brand-400 hover:text-brand-700">×</button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={addTag}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-sm outline-none"
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'

// Taiwan mobile format: "09" followed by 8 more digits (10 digits total).
export const TW_PHONE_REGEX = /^09\d{8}$/
// Plain address check for the e-invoice email (optional field; the server checks it again).
export const EMAIL_REGEX = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

// Two always-visible fields (Nama Pelanggan / Telepon Pelanggan), matching the reference design
// - not a single combined search box with new-customer fields only appearing after a failed
// search. Typing in the name field searches existing customers by name or phone (same backend
// behavior as before); picking a suggestion fills both fields and remembers the match's id.
// Editing either field afterward drops that id - it's manual entry again from that point, auto-
// created as a new customer on submit if nothing was (re-)selected. The suggestion list closes on a
// click / tap outside it, on Esc, and as soon as the phone field gets focus (it overlays that field),
// and comes back when the name field is focused again. Emits via onChange:
//   existing: the full customer row from the search API (id, name, phone, address, plus
//             last_pickup_chain_id/last_pickup_store_name/last_pickup_store_code)
//   new/manual: { name, phone, address: '', email }
// The email (Taiwan e-invoice) is optional: picking a customer pre-fills the one saved on them, and it stays editable.
export default function CustomerPicker({ onChange }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false) // suggestion list visible
  const boxRef = useRef(null)             // name field + its suggestion list
  const nameFocused = useRef(false)

  const reqId = useRef(0)

  // click / tap anywhere outside the name field and its list closes the list
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away) }
  }, [open])

  async function handleNameChange(v) {
    setName(v)
    setSelected(null)
    const id = ++reqId.current // a slow answer for an earlier keystroke must not overwrite a newer one
    if (!v.trim()) {
      setResults([])
      setOpen(false)
      onChange({ name: v, phone, address: '', email })
      return
    }
    const res = await client.get(`/customers?q=${encodeURIComponent(v)}`)
    // a late answer must not pop the list open again after the user moved on to another field
    if (id === reqId.current) { setResults(res.data); setOpen(nameFocused.current) }
    onChange({ name: v, phone, address: '', email })
  }

  function handlePhoneChange(v) {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
    setSelected(null)
    setOpen(false)
    onChange({ name, phone: digits, address: '', email })
  }

  function pick(customer) {
    setSelected(customer)
    setName(customer.name)
    setPhone(customer.phone)
    setEmail(customer.email || '')
    setResults([])
    setOpen(false)
    onChange({ ...customer, email: customer.email || '' })
  }

  function handleEmailChange(v) {
    const next = v.trim()
    setEmail(next)
    onChange(selected ? { ...selected, email: next } : { name, phone, address: '', email: next })
  }

  return (
    <div className="space-y-2">
      <div className="relative" ref={boxRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('shared.customer_name_label')}</label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => { nameFocused.current = true; if (results.length > 0 && !selected) setOpen(true) }}
          onBlur={() => { nameFocused.current = false }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          placeholder={t('shared.customer_search_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
              >
                <p className="font-medium text-gray-800 flex items-center gap-1.5">
                  {c.name}
                  {c.is_blacklisted && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                      {t('shared.customer_blacklist_badge')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{c.phone}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('shared.customer_phone_label')}</label>
        <input
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          onFocus={() => setOpen(false)}
          placeholder={t('shared.customer_phone_placeholder')}
          inputMode="numeric"
          maxLength={10}
          disabled={!!selected}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500 ${
            phone && !TW_PHONE_REGEX.test(phone) ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {phone && !TW_PHONE_REGEX.test(phone) && (
          <p className="text-xs text-red-600 mt-1">{t('shared.customer_phone_format_error')}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('shared.customer_email_label')}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onFocus={() => setOpen(false)}
          placeholder={t('shared.customer_email_placeholder')}
          maxLength={150}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
            email && !EMAIL_REGEX.test(email) ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {email && !EMAIL_REGEX.test(email) && (
          <p className="text-xs text-red-600 mt-1">{t('shared.customer_email_format_error')}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">{t('shared.customer_email_hint')}</p>
      </div>

      {selected?.is_blacklisted && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
          {t('shared.customer_blacklist_warning')}
        </div>
      )}

      <p className="text-xs text-gray-500">{t('shared.customer_new_auto_hint')}</p>
    </div>
  )
}

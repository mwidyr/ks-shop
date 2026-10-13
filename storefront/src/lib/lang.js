// UI language: id (default) / en / zh. Stored on the device; first visit follows the browser language.
export const LANGS = [
  { code: 'id', native: 'Bahasa Indonesia', short: 'Indonesia', zh: '印尼語' },
  { code: 'en', native: 'English', short: 'English', zh: '英文' },
  { code: 'zh', native: '中文', short: '中文', zh: '中文' },
]
const KEY = 'ralulu_lang'

export function detectLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && LANGS.some((l) => l.code === saved)) return saved
  } catch { /* private mode */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'id'
  const l = nav.toLowerCase()
  if (l.startsWith('zh')) return 'zh'
  if (l.startsWith('en')) return 'en'
  return 'id'
}
export function hasSavedLang() {
  try { return Boolean(localStorage.getItem(KEY)) } catch { return false }
}
export function saveLang(code) {
  try { localStorage.setItem(KEY, code) } catch { /* ignore */ }
}
let current = detectLang()
export const getLang = () => current
export const setCurrentLang = (code) => { current = code }

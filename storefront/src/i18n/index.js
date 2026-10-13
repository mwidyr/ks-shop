import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import id from './id'
import en from './en'
import zh from './zh'
import { detectLang, saveLang, setCurrentLang } from '../lib/lang'

// Page strings live in ./parts/*.js as { id, en, zh }; they are merged into the base dictionaries.
const partFiles = import.meta.glob('./parts/*.js', { eager: true })
const merge = (a, b) => {
  const out = { ...a }
  Object.entries(b || {}).forEach(([k, v]) => { out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v })
  return out
}
const dict = { id, en, zh }
Object.values(partFiles).forEach((m) => {
  Object.keys(dict).forEach((l) => { dict[l] = merge(dict[l], m.default?.[l]) })
})

const initial = detectLang()
setCurrentLang(initial)

i18n.use(initReactI18next).init({
  resources: { id: { translation: dict.id }, en: { translation: dict.en }, zh: { translation: dict.zh } },
  lng: initial,
  fallbackLng: 'id',
  interpolation: { escapeValue: false },
})
if (typeof document !== 'undefined') document.documentElement.lang = initial === 'zh' ? 'zh-Hant' : initial

// Switch the UI language: persists, updates <html lang>, and tells the API layer (X-Lang).
export function changeLang(code) {
  saveLang(code)
  setCurrentLang(code)
  document.documentElement.lang = code === 'zh' ? 'zh-Hant' : code
  return i18n.changeLanguage(code)
}

export default i18n

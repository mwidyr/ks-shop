import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import id from './locales/id.json'
import en from './locales/en.json'
import zh from './locales/zh.json'

const savedLanguage = (() => {
  try {
    return localStorage.getItem('language') || 'id'
  } catch {
    return 'id'
  }
})()

i18next.use(initReactI18next).init({
  resources: {
    id: { translation: id },
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: savedLanguage,
  fallbackLng: 'id',
  interpolation: { escapeValue: false },
})

export function changeLanguage(lang) {
  i18next.changeLanguage(lang)
  try {
    localStorage.setItem('language', lang)
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}

export default i18next

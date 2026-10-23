import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { listCategories } from '../api/categories'
import { listColors } from '../api/colors'

// Chinese (name_zh) is the canonical value stored on products.category/product_variants.color
// (unchanged free-text matching) - translateCategory/translateColor only affect what's
// *displayed*: Indonesian under id, English (colors.name_en, when set) under en, Chinese otherwise.
// A value with no match in the master list (legacy/custom text) is returned as-is.
const MasterDataContext = createContext({
  categories: [], colors: [],
  translateCategory: (v) => v, translateColor: (v) => v,
  toChineseColor: (v) => v, toEnglishColor: (v) => v,
})

// Stored product text is free-typed, so "Biru abu abu" must still find the master "Biru Abu Abu":
// compare ignoring case and stray/repeated spaces. An exact match always wins over a loose one.
export const normalizeMasterName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
export function findMaster(list, raw) {
  const exact = list.find((item) => item.name_zh === raw || item.name_id === raw || (item.name_en && item.name_en === raw))
  if (exact) return exact
  const key = normalizeMasterName(raw)
  if (!key) return undefined
  return list.find((item) => normalizeMasterName(item.name_zh) === key || normalizeMasterName(item.name_id) === key
    || (item.name_en && normalizeMasterName(item.name_en) === key))
}

export function MasterDataProvider({ children }) {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [colors, setColors] = useState([])

  // Only for a logged-in user: this provider wraps the whole app, including public no-login pages
  // (/live-data-upload, /pickup/:token), where these authenticated calls 401 and the shared client
  // would hard-redirect the visitor to /login.
  useEffect(() => {
    if (!user) return
    listCategories().then(setCategories)
    listColors().then(setColors)
  }, [user])

  // Matches on EITHER name_zh or name_id - not just name_zh. Data entered before this master
  // list existed has no governance on which language it was typed in (confirmed by the client:
  // plenty of pre-existing colors are stored as Indonesian text, not Chinese), so a one-direction
  // lookup silently fails to translate those when switching to Chinese.
  function translate(list, raw) {
    if (!raw) return raw
    const match = findMaster(list, raw)
    if (!match) return raw
    if (i18n.language === 'id') return match.name_id
    if (i18n.language === 'en' && match.name_en) return match.name_en
    return match.name_zh
  }

  // Always resolves to name_zh, regardless of the current UI locale - for places (like the
  // Purchase Requisition copy-text) that must show the canonical Chinese color name even when
  // the app itself is displaying Indonesian or English, and even when the raw stored value is
  // legacy Indonesian text (see the matching comment on translate() above).
  function toChinese(list, raw) {
    if (!raw) return raw
    const match = findMaster(list, raw)
    return match ? match.name_zh : raw
  }

  // The English Color Master name - the color part of a variant SKU (C002-BLACK-F), whatever the
  // UI locale; a color outside the master or without an English name stays as stored.
  function toEnglish(list, raw) {
    if (!raw) return raw
    const match = findMaster(list, raw)
    return match?.name_en || raw
  }

  const value = {
    categories,
    colors,
    translateCategory: (raw) => translate(categories, raw),
    translateColor: (raw) => translate(colors, raw),
    toChineseColor: (raw) => toChinese(colors, raw),
    toEnglishColor: (raw) => toEnglish(colors, raw),
  }

  return <MasterDataContext.Provider value={value}>{children}</MasterDataContext.Provider>
}

export function useMasterData() {
  return useContext(MasterDataContext)
}

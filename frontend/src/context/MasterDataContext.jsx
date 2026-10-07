import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { listCategories } from '../api/categories'
import { listColors } from '../api/colors'

// Chinese (name_zh) is the canonical value stored on products.category/product_variants.color
// (unchanged free-text matching) - translateCategory/translateColor only affect what's
// *displayed* under the Indonesian locale. A value with no match in the master list (legacy/
// custom text, or the zh/en locales, which have no separate translation) is returned as-is.
const MasterDataContext = createContext({
  categories: [], colors: [],
  translateCategory: (v) => v, translateColor: (v) => v,
  toChineseColor: (v) => v,
})

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
    const match = list.find((item) => item.name_zh === raw || item.name_id === raw)
    if (!match) return raw
    return i18n.language === 'id' ? match.name_id : match.name_zh
  }

  // Always resolves to name_zh, regardless of the current UI locale - for places (like the
  // Purchase Requisition copy-text) that must show the canonical Chinese color name even when
  // the app itself is displaying Indonesian or English, and even when the raw stored value is
  // legacy Indonesian text (see the matching comment on translate() above).
  function toChinese(list, raw) {
    if (!raw) return raw
    const match = list.find((item) => item.name_zh === raw || item.name_id === raw)
    return match ? match.name_zh : raw
  }

  const value = {
    categories,
    colors,
    translateCategory: (raw) => translate(categories, raw),
    translateColor: (raw) => translate(colors, raw),
    toChineseColor: (raw) => toChinese(colors, raw),
  }

  return <MasterDataContext.Provider value={value}>{children}</MasterDataContext.Provider>
}

export function useMasterData() {
  return useContext(MasterDataContext)
}

import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCategories } from '../api/categories'
import { listColors } from '../api/colors'

// Chinese (name_zh) is the canonical value stored on products.category/product_variants.color
// (unchanged free-text matching) - translateCategory/translateColor only affect what's
// *displayed* under the Indonesian locale. A value with no match in the master list (legacy/
// custom text, or the zh/en locales, which have no separate translation) is returned as-is.
const MasterDataContext = createContext({
  categories: [], colors: [],
  translateCategory: (v) => v, translateColor: (v) => v,
})

export function MasterDataProvider({ children }) {
  const { i18n } = useTranslation()
  const [categories, setCategories] = useState([])
  const [colors, setColors] = useState([])

  useEffect(() => {
    listCategories().then(setCategories)
    listColors().then(setColors)
  }, [])

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

  const value = {
    categories,
    colors,
    translateCategory: (raw) => translate(categories, raw),
    translateColor: (raw) => translate(colors, raw),
  }

  return <MasterDataContext.Provider value={value}>{children}</MasterDataContext.Provider>
}

export function useMasterData() {
  return useContext(MasterDataContext)
}

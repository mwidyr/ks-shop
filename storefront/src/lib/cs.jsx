import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useStore } from './store'
import { lineUrl, waUrl } from './wa'
import { IconLine, IconWhatsApp } from '../components/Icons'
import CsSheet from '../components/CsSheet'

// Chat apps a customer can reach CS on. Each entry knows how to build its click-to-chat link from the store
// settings (Ralulu Hub > Store Profile). Another app (Zalo, WeChat ...) = one more entry here + its setting;
// the sheet and every button that opens it stay as they are.
export const CS_CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', color: '#1FA855', Icon: IconWhatsApp, href: (settings, text) => waUrl(settings.whatsapp_number, text) },
  { key: 'line', label: 'LINE', color: '#06C755', Icon: IconLine, href: (settings, text) => lineUrl(settings.line_id, text) },
]

// The channels that are set up, each with its ready-to-open link for this message.
export function csChannels(settings, text) {
  return CS_CHANNELS.map((c) => ({ ...c, url: c.href(settings || {}, text) })).filter((c) => c.url)
}

const CsContext = createContext({ openCs: () => {}, channels: () => [] })

// openCs(message): the one entry for every "Ask CS" button that is not a link to the CS page. With a single
// channel set up it opens that chat straight away; with several it slides up the bottom sheet to pick one.
export function CsProvider({ children }) {
  const { settings } = useStore()
  const [sheet, setSheet] = useState(null) // { text }
  const openCs = useCallback((text) => {
    const list = csChannels(settings, text)
    if (list.length === 1) { window.open(list[0].url, '_blank', 'noopener'); return }
    setSheet({ text })
  }, [settings])
  const value = useMemo(() => ({ openCs, channels: (text) => csChannels(settings, text) }), [openCs, settings])
  return (
    <CsContext.Provider value={value}>
      {children}
      <CsSheet open={Boolean(sheet)} text={sheet?.text || ''} channels={sheet ? csChannels(settings, sheet.text) : []} onClose={() => setSheet(null)} />
    </CsContext.Provider>
  )
}

export const useCs = () => useContext(CsContext)

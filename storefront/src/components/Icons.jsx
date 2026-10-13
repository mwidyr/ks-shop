// Line icons from the design's Icons artboard: 24x24 canvas, round caps, colour follows the text.
// Important actions are always "icon + label" in the UI; icons here carry no meaning on their own.
const base = (size, sw, stroke) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
})

function make(children, { sw = 1.8, fill } = {}) {
  return function Icon({ size = 22, stroke = 'currentColor', strokeWidth, style, className }) {
    const p = base(size, strokeWidth || sw, stroke)
    return (
      <svg {...p} style={style} className={className}>
        {typeof children === 'function' ? children(fill) : children}
      </svg>
    )
  }
}

export const IconHome = make(<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />)
export const IconDoc = make(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>)
export const IconCart = make(<><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></>)
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>)
export const IconMenu = make(<path d="M4 7h16M4 12h16M4 17h16" />, { sw: 1.9 })
export const IconBack = make(<path d="M15 6l-6 6 6 6" />, { sw: 2.4 })
export const IconChevRight = make(<path d="M9 6l6 6-6 6" />, { sw: 2 })
export const IconChevDown = make(<path d="M6 9l6 6 6-6" />, { sw: 2.4 })
export const IconCheck = make(<path d="M5 12l5 5 9-10" />, { sw: 3 })
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>, { sw: 2 })
export const IconPlay = ({ size = 16, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>
)
export const IconPause = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
)
export const IconGlobe = make(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>)
export const IconShare = make(<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />, { sw: 2 })
export const IconHeart = ({ size = 17, filled, stroke = 'currentColor', strokeWidth = 1.8 }) => (
  <svg {...base(size, strokeWidth, stroke)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
  </svg>
)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />, { sw: 2 })
export const IconMinus = make(<path d="M5 12h14" />, { sw: 2 })
export const IconHeadset = make(
  <>
    <circle cx="12" cy="9.5" r="3.6" /><path d="M5.5 21c1.1-3.4 3.6-5.2 6.5-5.2s5.4 1.8 6.5 5.2" /><path d="M6.2 10a5.8 5.8 0 0 1 11.6 0" />
    <rect x="4.6" y="9.2" width="2.4" height="3.6" rx="1.2" fill="currentColor" /><rect x="17" y="9.2" width="2.4" height="3.6" rx="1.2" fill="currentColor" />
    <path d="M18.2 12.8v1.2a2 2 0 0 1-2 2H14" />
  </>, { sw: 1.9 },
)
export const IconGrid = make(<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>)
export const IconAlert = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>)
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>)
export const IconTruck = make(<><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>, { sw: 1.7 })
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />, { sw: 2.4 })
export const IconArrowRight = make(<path d="M3 12h18M15 6l6 6-6 6" />, { sw: 2.4 })
export const IconWhatsApp = make(<><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c.3 2 1.8 3.8 4.3 4.6l1.2-1.1 1.8.8-.4 1.6c-3.6.2-7-3-7.2-6.6l1.6-.5.8 1.8z" /></>, { sw: 1.9 })
export const IconTicket = make(<><path d="M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /><path d="M10 8v10" /></>)
export const IconBook = make(<><path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" /><path d="M20 5h-4a2 2 0 0 0-2 2" /></>)
export const IconHeadphones = make(<><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v3a2 2 0 0 0 2 2h2v-5H4M20 13v3a2 2 0 0 1-2 2h-2v-5h4" /></>, { sw: 2 })
export const IconChat = make(<path d="M4 5h16v11H9l-5 4z" />, { sw: 2 })
export const IconSort = make(<path d="M4 6h16M7 12h10M10 18h4" />, { sw: 2 })
export const IconStore = make(<><path d="M4 10l1.5-5h13L20 10" /><path d="M5 10v9h14v-9" /><path d="M4 10h16" /><path d="M10 19v-5h4v5" /></>)
export const IconOrderOk = make(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 12l2 2 4-4" /></>)
export const IconHostSearch = make(<><circle cx="10" cy="8" r="3.5" /><path d="M3.5 19c1-3 3.5-4.5 6.5-4.5" /><circle cx="17" cy="16" r="3" /><path d="M21 20l-1.8-1.8" /></>)
export const IconLiveTv = make(<><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M10 9.5l5 2.5-5 2.5z" /></>)
export const IconHanger = make(<path d="M12 7a2 2 0 1 1 2 2c-1 .5-2 1-2 2l9 6H3l9-6" />)
export const IconYoutube = make(<><rect x="3" y="6" width="18" height="12" rx="4" /><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" /></>)
export const IconInstagram = make(<><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.5" /><circle cx="17" cy="7" r="1" fill="currentColor" /></>)
export const IconFacebook = make(<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />)
export const IconTiktok = make(<><path d="M14 4v11a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.5 2.5 2.5 4 5 4" /></>, { sw: 1.9 })
export const IconTrash = make(<><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></>)
export const IconSpinner = ({ size = 18 }) => (
  <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 1-9 9" />
  </svg>
)
export const IconImage = make(<><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l5-4 3 3 3-2 3 3" /></>)
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
export const IconPin = make(<><path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></>)
export const IconFilter = make(<><path d="M4 6h16M7 12h10M10 18h4" /></>, { sw: 2 })
export const IconBell = make(<><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>)
export const IconBox = make(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>)
export const IconUndo = make(<><path d="M9 7L4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -4)" /></>)

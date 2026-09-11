const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconDashboard(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

export function IconOrders(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M8 12h8M8 16h5" />
    </svg>
  )
}

export function IconProducts(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v9l9 5 9-5V8" />
      <path d="M12 13v9" />
    </svg>
  )
}

export function IconSettings(props) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconLogout(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function IconBell(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export function IconChevronDown(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function IconPencil(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function IconTrash(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
    </svg>
  )
}

export function IconEye(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconArrowRight(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

export function IconPlus(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconTag(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3v5.59a2 2 0 0 0 .59 1.41l9.59 9.59a2 2 0 0 0 2.82 0l3.59-3.59a2 2 0 0 0 0-2.59Z" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconTruck(props) {
  return (
    <svg {...base} {...props}>
      <rect x="1" y="6" width="13" height="11" rx="1" />
      <path d="M14 10h4l3 3v4h-7z" />
      <circle cx="6" cy="19" r="1.6" />
      <circle cx="17.5" cy="19" r="1.6" />
    </svg>
  )
}

export function IconMegaphone(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l7 4V5L6 9H4a1 1 0 0 0-1 1Z" />
      <path d="M17 8a4 4 0 0 1 0 8" />
    </svg>
  )
}

export function IconChartLine(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3v18h18" />
      <path d="m6 15 4-5 4 3 6-8" />
    </svg>
  )
}

export function IconWallet(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="16" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconStore(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9" />
      <path d="M3 9h18" />
    </svg>
  )
}

export function IconGear(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function IconStar(props) {
  return (
    <svg {...base} width={16} height={16} fill="currentColor" stroke="none" {...props}>
      <path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7-5.4-4.7 7.1-.6Z" />
    </svg>
  )
}

export function IconSend(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

export function IconClose(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

export function IconUser(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6.5 8-6.5S20 17 20 21" />
    </svg>
  )
}

export function IconSliders(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

export function IconBroadcast(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

export function IconUsers(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17" cy="8" r="2.3" />
      <path d="M16 14.5c2.5.3 4 2 4 5.5" />
    </svg>
  )
}

export function IconChat(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M4 4h16v12H8l-4 4Z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="12.5" x2="13" y2="12.5" />
    </svg>
  )
}

export function IconLayers(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  )
}

export function IconWarehouse(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M3 10 12 4l9 6v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-7h6v7" />
    </svg>
  )
}

export function IconClipboard(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" fill="currentColor" stroke="none" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function IconUndo(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M4 10h10a5 5 0 0 1 0 10h-2" />
      <path d="M8 5 4 10l4 5" />
    </svg>
  )
}

export function IconBarChart(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <line x1="5" y1="21" x2="5" y2="13" />
      <line x1="12" y1="21" x2="12" y2="7" />
      <line x1="19" y1="21" x2="19" y2="11" />
    </svg>
  )
}

export function IconUserCog(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.8 6-5.8s6 2.5 6 5.8" />
      <circle cx="18.5" cy="15.5" r="2" />
      <path d="M18.5 12.3v.7M18.5 17.8v.7M21 15.5h-.7M16.7 15.5H16M20.1 13l-.5.5M17.4 17.5l-.5.5M20.1 18l-.5-.5M17.4 13.5l-.5-.5" />
    </svg>
  )
}

export function IconPuzzle(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M9 4h4v2.2a1.8 1.8 0 1 0 0 3.6V12h4a1.8 1.8 0 1 1 0 4v4H4v-4a1.8 1.8 0 1 0 0-4V9a1.8 1.8 0 1 0 0-3.6V4h5Z" />
    </svg>
  )
}

export function IconFileText(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M7 3h7l5 5v13H7Z" />
      <path d="M14 3v5h5" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
    </svg>
  )
}

export function IconPalette(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.1-1.7-.4-.6-.1-1.5.7-1.6h1.7A3.5 3.5 0 0 0 19 14c0-6-3-11-7-11Z" />
      <circle cx="7.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSparkles(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  )
}

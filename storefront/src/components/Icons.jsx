const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
export const SearchIcon = (p) => <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
export const BagIcon = (p) => <svg {...base} {...p}><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
export const MenuIcon = (p) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
export const CloseIcon = (p) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const ChevronDown = (p) => <svg {...base} width={14} height={14} {...p}><path d="m6 9 6 6 6-6" /></svg>
export const ChevronLeft = (p) => <svg {...base} {...p}><path d="m15 6-6 6 6 6" /></svg>
export const ChevronRight = (p) => <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>
export const TruckIcon = (p) => <svg {...base} {...p}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>
export const ShieldIcon = (p) => <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
export const TagIcon = (p) => <svg {...base} {...p}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1" /></svg>
export const PackageIcon = (p) => <svg {...base} {...p}><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4M12 11v10" /></svg>

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/favicon.svg" alt="" className="w-8 h-8" />
      <span className="font-display text-2xl tracking-wider leading-none">RALULU</span>
    </span>
  )
}

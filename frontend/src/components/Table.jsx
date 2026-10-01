// Shared class-string constants + a small Metric helper for the system-wide Data Table redesign.
// Deliberately plain exports (not a wrapper component) so existing <table>/<tr>/<td> markup
// across ~20 pages only needs its className swapped, not its structure - keeps the migration
// mechanical and low-risk. Colors come from the CSS variables defined in index.html (flip
// automatically with the existing html.dark toggle).
export const tableClasses = 'w-full text-sm'
export const theadRowClasses = 'text-left text-[var(--text-secondary)] text-xs uppercase border-b border-[var(--table-divider)]'
export const tbodyClasses = 'divide-y divide-[var(--table-divider)]'
export const rowClasses = 'hover:bg-[var(--table-row-hover)] transition-colors'
export const cardClasses = 'bg-[var(--table-card-bg)] rounded-2xl shadow-sm'
export const pageBgClasses = 'bg-[var(--table-page-bg)]'
export const cellPaddingClasses = 'p-3.5'
export const textPrimaryClasses = 'text-[var(--text-primary)]'
export const textSecondaryClasses = 'text-[var(--text-secondary)]'

const metricColor = { qty: 'var(--qty-color)', ord: 'var(--ord-color)', gmv: 'var(--gmv-color)' }

// Wraps a QTY/ORD/GMV numeric value in the client-specified bold color. Only the value gets
// colored - column headers stay in the standard secondary header color (theadRowClasses above).
export function Metric({ type, children, className = '' }) {
  const color = metricColor[type]
  return (
    <span className={`font-bold ${className}`} style={{ color }}>
      {children}
    </span>
  )
}

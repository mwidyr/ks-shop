export function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(n)
}

// Purchase Requisition amounts are explicitly client-specified as CNY (Purchase Requisitions
// Adjustments PDF) - scoped to that feature only, not a global currency-display change (no other
// page in the app shows a currency symbol today).
export function formatCNY(n) {
  return `¥ ${formatCurrency(n)}`
}

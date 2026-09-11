export function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(n)
}

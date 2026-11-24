// Parses the 3PL warehouse's stock report (倉庫總存量統計表): SKU = 物料編號 (col B), quantity = 可用庫存(虛擬庫存)
// (col J, the 3PL's available/virtual stock - the figure the 3PL itself checks orders against).
// Columns are found by their header text, so a changed column order is refused instead of misread.
// The 3PL's virtual stock goes negative when it has oversold a SKU; Actual Stock can't, so a negative is read as 0.
const SKU_HEADER = '物料編號'
const QTY_HEADER = '可用庫存(虛擬庫存)'

// Header cells are compared with full-width brackets folded to ASCII, in case the 3PL's export ever changes them.
const norm = (c) => String(c).trim().replace(/（/g, '(').replace(/）/g, ')')

export async function parseTplStockFile(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  return parseTplStockRows(rows)
}

export function parseTplStockRows(rows) {
  const headerAt = rows.findIndex((r) => r.some((c) => norm(c) === SKU_HEADER) && r.some((c) => norm(c) === QTY_HEADER))
  if (headerAt < 0) throw new Error('header_not_found')
  const skuCol = rows[headerAt].findIndex((c) => norm(c) === SKU_HEADER)
  const qtyCol = rows[headerAt].findIndex((c) => norm(c) === QTY_HEADER)
  const lines = []
  for (const r of rows.slice(headerAt + 1)) {
    const sku = String(r[skuCol] ?? '').trim()
    if (!sku) continue
    const raw = r[qtyCol]
    const num = raw === '' || raw == null ? 0 : Number(raw)
    if (!Number.isInteger(num)) throw new Error(`bad_qty:${sku}`)
    lines.push({ sku, qty: Math.max(0, num) })
  }
  if (lines.length === 0) throw new Error('empty')
  return lines
}

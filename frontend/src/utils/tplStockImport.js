// Parses the 3PL warehouse's stock report (倉庫總存量統計表): SKU = 物料編號 (col B), Actual quantity = 實際數量 (col K).
// Columns are found by their header text, so a changed column order is refused instead of misread.
const SKU_HEADER = '物料編號'
const QTY_HEADER = '實際數量'

export async function parseTplStockFile(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  return parseTplStockRows(rows)
}

export function parseTplStockRows(rows) {
  const headerAt = rows.findIndex((r) => r.some((c) => String(c).trim() === SKU_HEADER) && r.some((c) => String(c).trim() === QTY_HEADER))
  if (headerAt < 0) throw new Error('header_not_found')
  const skuCol = rows[headerAt].findIndex((c) => String(c).trim() === SKU_HEADER)
  const qtyCol = rows[headerAt].findIndex((c) => String(c).trim() === QTY_HEADER)
  const lines = []
  for (const r of rows.slice(headerAt + 1)) {
    const sku = String(r[skuCol] ?? '').trim()
    if (!sku) continue
    const raw = r[qtyCol]
    const qty = raw === '' || raw == null ? 0 : Number(raw)
    if (!Number.isInteger(qty) || qty < 0) throw new Error(`bad_qty:${sku}`)
    lines.push({ sku, qty })
  }
  if (lines.length === 0) throw new Error('empty')
  return lines
}

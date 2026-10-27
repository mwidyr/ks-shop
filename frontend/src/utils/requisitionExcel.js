// Purchase requisition export in the warehouse (WMS) stock-in template "進倉單匯入範例" (sheet 進倉匯入範例): 14 columns,
// A..N, in the template's order. Filled columns:
//   A 入庫日期*  left blank (entered when the goods arrive)
//   D 品號*      full SKU of the variant (PRODUCT-COLOR-SIZE), e.g. P021-WHITE-2XL
//   F 單位*      always 件
// Every other column stays in place and empty. One row per SKU (a SKU planned under two suppliers is one row).
export const WMS_STOCK_IN_SHEET = '進倉匯入範例'

export const WMS_STOCK_IN_HEADERS = [
  '入庫日期*', '單號', '倉別', '品號*', '數量*', '單位*', '效期', '批號', '進倉單備註', '單品備註', '報單號碼', '額外單號', '進倉類別', '供應商',
]

export const WMS_STOCK_IN_UNIT = '件'

const COL_SKU = WMS_STOCK_IN_HEADERS.indexOf('品號*')
const COL_UNIT = WMS_STOCK_IN_HEADERS.indexOf('單位*')

// detail = the requisition as the detail page loads it ({ suppliers: [{ items: [{ sku }] }] }).
export function stockInRows(detail) {
  const seen = new Set()
  const rows = []
  for (const g of detail?.suppliers || []) {
    for (const it of g.items || []) {
      const sku = String(it.sku || '').trim()
      if (!sku || seen.has(sku)) continue
      seen.add(sku)
      const row = Array(WMS_STOCK_IN_HEADERS.length).fill('')
      row[COL_SKU] = sku
      row[COL_UNIT] = WMS_STOCK_IN_UNIT
      rows.push(row)
    }
  }
  return rows
}

export const stockInSheetData = (detail) => [WMS_STOCK_IN_HEADERS, ...stockInRows(detail)]

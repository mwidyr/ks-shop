// Purchase requisition export in the warehouse (WMS) stock-in template "進倉單匯入範例" (sheet 進倉匯入範例): 14 columns,
// A..N, in the template's order. Filled columns:
//   A 入庫日期*  creation date and time of the requisition, a real Excel date-time shown as 2026/11/11 00:00
//   B 單號       the requisition number, e.g. REQ-00008
//   D 品號*      full SKU of the variant (PRODUCT-COLOR-SIZE), e.g. P021-WHITE-2XL
//   E 數量*      Planned QTY of the SKU (summed when the SKU is planned under more than one supplier)
//   F 單位*      always 件
// Every other column stays in place and empty. One row per SKU (a SKU planned under two suppliers is one row).
import { exportSku } from './exportSku'

export const WMS_STOCK_IN_SHEET = '進倉匯入範例'

export const WMS_STOCK_IN_HEADERS = [
  '入庫日期*', '單號', '倉別', '品號*', '數量*', '單位*', '效期', '批號', '進倉單備註', '單品備註', '報單號碼', '額外單號', '進倉類別', '供應商',
]

export const WMS_STOCK_IN_UNIT = '件'
export const WMS_DATE_FORMAT = 'yyyy/mm/dd hh:mm'

const COL_DATE = WMS_STOCK_IN_HEADERS.indexOf('入庫日期*')
const COL_NO = WMS_STOCK_IN_HEADERS.indexOf('單號')

const COL_SKU = WMS_STOCK_IN_HEADERS.indexOf('品號*')
const COL_QTY = WMS_STOCK_IN_HEADERS.indexOf('數量*')
const COL_UNIT = WMS_STOCK_IN_HEADERS.indexOf('單位*')

// detail = the requisition as the detail page loads it ({ suppliers: [{ items: [{ sku, planned_qty }] }] }).
export function stockInRows(detail) {
  const created = detail?.created_at ? new Date(detail.created_at) : null
  const createdAt = created && !Number.isNaN(created.getTime()) ? created : ''
  const no = String(detail?.requisition_no || '')
  const bySku = new Map()
  for (const g of detail?.suppliers || []) {
    for (const it of g.items || []) {
      const sku = String(it.sku || '').trim()
      if (!sku) continue
      let row = bySku.get(sku)
      if (!row) {
        row = Array(WMS_STOCK_IN_HEADERS.length).fill('')
        row[COL_DATE] = createdAt
        row[COL_NO] = no
        row[COL_SKU] = exportSku(sku)
        row[COL_QTY] = 0
        row[COL_UNIT] = WMS_STOCK_IN_UNIT
        bySku.set(sku, row)
      }
      row[COL_QTY] += Number(it.planned_qty) || 0
    }
  }
  return [...bySku.values()]
}

export const stockInSheetData = (detail) => [WMS_STOCK_IN_HEADERS, ...stockInRows(detail)]

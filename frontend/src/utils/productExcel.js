// Product export in the warehouse (WMS) import template "商品匯入範例" (sheet 物料匯入): 33 columns, A..AG, in the
// template's order. Only three columns are filled; every other column stays in place and empty.
//   A 商品名稱  Chinese product name (the 'zh' name, else the product's own name)
//   C 品號      full SKU of the variant (PRODUCT-COLOR-SIZE)
//   G 單位規格  always 1件
// One row per color / size combination (= per variant).
export const WMS_SHEET_NAME = '物料匯入'

export const WMS_HEADERS = [
  '商品名稱 *', '國際條碼', '品號 *', '分類', '品牌', '箱外條碼', '單位規格 *', '原始效期(天)', '即期天數', '備註',
  '外箱長(CM)', '外箱寬(CM)', '外箱高(CM)', '外箱重(KG)', '堆疊底(箱)', '堆疊高(層)', '堆疊數', '進貨價', '顏色', '尺寸',
  '生產國(兩碼國家代碼)', '報關商品名稱', 'HS碼', '材質', '中單位條碼', '規格', '溫層(1/2/3/4/5)', '海外進口', '同步EC庫存', '其他條碼',
  'QC時回登序號', '箱序號分隔符號', '序號數量',
]

export const WMS_UNIT_SPEC = '1件'

export function wmsRows(products) {
  return (products || []).flatMap((p) => {
    const name = (p.names?.zh || '').trim() || p.name || ''
    return (p.variants || []).map((v) => {
      const row = Array(WMS_HEADERS.length).fill('')
      row[0] = name
      row[2] = v.sku || ''
      row[6] = WMS_UNIT_SPEC
      return row
    })
  })
}

// Sheet as an array of arrays (header first), ready for XLSX.utils.aoa_to_sheet.
export function wmsSheetData(products) {
  return [WMS_HEADERS, ...wmsRows(products)]
}

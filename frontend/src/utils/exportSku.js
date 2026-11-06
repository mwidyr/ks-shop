// The 3PL warehouse's scanners cannot read "-", so SKU codes leave the system without hyphens in exported Excel
// files (P023-KHAKI-L -> P023KHAKIL). Only the exported cell changes; stored SKUs stay as they are.
export const exportSku = (sku) => String(sku ?? '').replace(/-/g, '')

import { useTranslation } from 'react-i18next'
import { resolveUrl } from '../utils/image'
import { useMasterData } from '../context/MasterDataContext'

// Read-only order line: product, qty and the stock line (Available = Actual + Incoming - Ordered).
// Picking is gone - stock only moves when the 3PL confirms shipment (Shipping Workbench).
export default function OrderLineItem({
  sku, productName, imageUrl, color, size, qty,
  available, actualStock, isOversell, hostName, meta,
}) {
  const { t } = useTranslation()
  const { translateColor } = useMasterData()
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex gap-3">
        <img src={resolveUrl(imageUrl)} className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
        <div className="flex-1 min-w-0">
          {meta}
          <p className="text-xs font-mono text-brand-600">{sku}</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{productName}</p>
          <p className="text-xs text-gray-500">{translateColor(color)} / {size}</p>
          {hostName && <p className="text-[11px] text-brand-600">Host: {hostName}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className={`text-xs font-mono ${isOversell ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {t('shared.stock_line', { available, actual: actualStock })}
          {isOversell && <span> ⚠️ {t('shared.oversell_warning')}</span>}
        </p>
        <p className="text-sm font-mono text-gray-700">× {qty}</p>
      </div>
    </div>
  )
}

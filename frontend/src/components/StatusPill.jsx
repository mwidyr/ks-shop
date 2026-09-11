export const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  picking: 'bg-purple-100 text-purple-700',
  ready_to_ship: 'bg-teal-100 text-teal-700',
  shipped: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  return: 'bg-orange-100 text-orange-700',
}

export const statusLabels = {
  pending: 'Pending', picking: 'Picking', ready_to_ship: 'Ready to Ship',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', return: 'Return',
}

// Pages built before i18n was introduced still import statusLabels/statusColors directly
// (a static Indonesian dictionary) - kept as-is for backward compatibility. The pill itself
// prefers the active-language translation when rendered inside a i18next-enabled tree.
import { useTranslation } from 'react-i18next'

export default function StatusPill({ status }) {
  const { t, i18n } = useTranslation()
  const label = i18n.isInitialized ? t(`status.${status}`, statusLabels[status] || status) : (statusLabels[status] || status)
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

export const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirm: 'bg-blue-100 text-blue-700',
  packing: 'bg-indigo-100 text-indigo-700',
  picking: 'bg-purple-100 text-purple-700',
  shipped: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  return: 'bg-orange-100 text-orange-700',
}

export const statusLabels = {
  pending: 'Pending', confirm: 'Confirm', packing: 'Packing', picking: 'Picking',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', return: 'Return',
}

export default function StatusPill({ status }) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-600'}`}>
      {statusLabels[status] || status}
    </span>
  )
}

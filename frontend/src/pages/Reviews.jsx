import MockPage from '../components/MockPage'
import { IconStar } from '../components/icons'

const reviews = [
  { customer: 'Rina Wijaya', product: 'Sneakers Classic White', rating: 5, text: 'Bagus banget, sesuai foto!' },
  { customer: 'Joko Santoso', product: 'Kaos Polos Premium', rating: 4, text: 'Bahannya adem, pengiriman cepat.' },
  { customer: 'Maya Sari', product: 'Jaket Denim Jeans', rating: 2, text: 'Ukuran kekecilan dari yang diharapkan.' },
]

export default function Reviews() {
  return (
    <MockPage icon="⭐" title="Reviews" description="Ulasan pelanggan untuk setiap produk.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {reviews.map((r, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-800">{r.customer}</span>
              <div className="flex gap-0.5 text-yellow-400">
                {Array.from({ length: 5 }).map((_, j) => <IconStar key={j} className={j < r.rating ? '' : 'opacity-20'} />)}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">{r.product}</p>
            <p className="text-sm text-gray-600">{r.text}</p>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

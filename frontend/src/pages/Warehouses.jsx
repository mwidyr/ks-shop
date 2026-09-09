import MockPage from '../components/MockPage'

const warehouses = [
  { name: 'Gudang Utama - Jakarta', address: 'Jl. Industri Raya No. 1', items: 1284 },
  { name: 'Gudang Cabang - Bandung', address: 'Jl. Soekarno Hatta No. 45', items: 356 },
]

export default function Warehouses() {
  return (
    <MockPage icon="🏬" title="Warehouses" description="Kelola beberapa lokasi gudang penyimpanan stok.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {warehouses.map((w) => (
          <div key={w.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{w.name}</p>
              <p className="text-xs text-gray-500">{w.address}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600">{w.items} item</span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

import MockPage from '../components/MockPage'

const promos = [
  { name: 'Diskon 9.9', type: 'Percentage', value: '10%', status: 'Aktif' },
  { name: 'Gratis Ongkir Minimal NT$150', type: 'Shipping', value: 'NT$15', status: 'Aktif' },
  { name: 'Bundling Kaos 2pcs', type: 'Bundle', value: 'NT$50', status: 'Berakhir' },
]

export default function Promotions() {
  return (
    <MockPage icon="🏷️" title="Promotions" description="Diskon dan penawaran khusus untuk pelanggan.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {promos.map((p) => (
          <div key={p.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-500">{p.type} · {p.value}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

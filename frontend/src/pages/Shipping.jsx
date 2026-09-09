import MockPage from '../components/MockPage'

const zones = [
  { name: 'Jabodetabek', courier: 'Kurir Toko / JNE', rate: 'Rp 10.000', eta: '1-2 hari' },
  { name: 'Pulau Jawa', courier: 'JNE / J&T', rate: 'Rp 18.000', eta: '2-3 hari' },
  { name: 'Luar Jawa', courier: 'SiCepat / AnterAja', rate: 'Rp 25.000', eta: '3-5 hari' },
]

export default function Shipping() {
  return (
    <MockPage icon="🚚" title="Shipping Rates" description="Aturan ongkos kirim & zona pengiriman (terpisah dari data kurir di Pengaturan).">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {zones.map((z) => (
          <div key={z.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{z.name}</p>
              <p className="text-xs text-gray-500">{z.courier} · Estimasi {z.eta}</p>
            </div>
            <span className="text-sm font-semibold text-brand-600">{z.rate}</span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

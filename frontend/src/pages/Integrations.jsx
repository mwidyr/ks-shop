import MockPage from '../components/MockPage'

const integrations = [
  { name: 'WhatsApp Business', desc: 'Kirim notifikasi order lewat WhatsApp', connected: true },
  { name: 'Telegram Bot', desc: 'Terima notifikasi order baru di Telegram', connected: false },
  { name: 'Google Sheets', desc: 'Sinkronisasi data order otomatis', connected: false },
  { name: 'Meta Ads', desc: 'Sinkronisasi performa iklan Facebook/Instagram', connected: false },
]

export default function Integrations() {
  return (
    <MockPage icon="🔌" title="Integrations" description="Hubungkan KS Shop dengan layanan pihak ketiga.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {integrations.map((i) => (
          <div key={i.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{i.name}</p>
              <p className="text-xs text-gray-500">{i.desc}</p>
            </div>
            <button className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
              i.connected ? 'bg-green-50 text-green-700' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
              {i.connected ? 'Terhubung' : 'Hubungkan'}
            </button>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

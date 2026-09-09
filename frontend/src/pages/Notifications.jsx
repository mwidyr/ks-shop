import { useState } from 'react'

const notifications = [
  { icon: '⚠️', text: '12 produk stok menipis', time: '10 menit lalu' },
  { icon: '🚚', text: '5 order harus dikirim hari ini', time: '25 menit lalu' },
  { icon: '↩️', text: '3 permintaan retur baru', time: '1 jam lalu' },
  { icon: '⭐', text: '2 ulasan negatif masuk', time: '2 jam lalu' },
  { icon: '📢', text: 'Campaign "Flash Sale 9.9" berakhir besok', time: '3 jam lalu' },
]

const channels = ['In-app', 'Email', 'WhatsApp', 'Telegram', 'Push Notification']

export default function Notifications() {
  const [enabled, setEnabled] = useState({ 'In-app': true, Email: true, WhatsApp: false, Telegram: false, 'Push Notification': true })

  return (
    <div className="px-4 sm:px-6 py-6 grid md:grid-cols-3 gap-6 items-start">
      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Notifikasi</h2>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Preview</span>
        </div>
        <div className="divide-y">
          {notifications.map((n, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span className="text-xl">{n.icon}</span>
              <div className="flex-1">
                <p className="text-sm text-gray-700">{n.text}</p>
                <p className="text-xs text-gray-400">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">Channel</h2>
        <div className="space-y-3">
          {channels.map((c) => (
            <div key={c} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{c}</span>
              <button
                onClick={() => setEnabled((e) => ({ ...e, [c]: !e[c] }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${enabled[c] ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${enabled[c] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

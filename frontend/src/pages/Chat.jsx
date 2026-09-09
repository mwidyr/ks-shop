import { useState } from 'react'
import { IconSend, IconSparkles } from '../components/icons'

const conversations = [
  { id: 1, name: 'Rina Wijaya', last: 'Kapan barang dikirim?', time: '10:32', unread: 2 },
  { id: 2, name: 'Joko Santoso', last: 'Terima kasih kak!', time: '09:15', unread: 0 },
  { id: 3, name: 'Maya Sari', last: 'Apakah stok warna hitam masih ada?', time: 'Kemarin', unread: 1 },
  { id: 4, name: 'Dedi Kurniawan', last: 'Oke ditunggu ya', time: 'Kemarin', unread: 0 },
]

const templates = [
  'Terima kasih sudah berbelanja! 🙏',
  'Pesanan Anda sedang diproses.',
  'Mohon ditunggu, barang segera dikirim hari ini.',
  'Stok tersedia, silakan checkout ya kak.',
]

const thread = [
  { from: 'customer', text: 'Halo kak, kapan barang dikirim?', time: '10:30' },
  { from: 'ai', text: 'Pesanan Anda sudah diproses dan dijadwalkan dikirim hari ini.', time: '10:32', suggestion: true },
]

export default function Chat() {
  const [activeId, setActiveId] = useState(1)
  const [messages, setMessages] = useState(thread)
  const [draft, setDraft] = useState('')
  const active = conversations.find((c) => c.id === activeId)

  function send(text) {
    if (!text) return
    setMessages((m) => [...m, { from: 'seller', text, time: 'Sekarang' }])
    setDraft('')
  }

  function approveAi(text) {
    setMessages((m) => [...m, { from: 'seller', text, time: 'Sekarang' }])
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      <div className="bg-white rounded-2xl shadow-sm flex h-[70vh] overflow-hidden">
        <div className="w-72 border-r border-gray-100 overflow-y-auto shrink-0">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${activeId === c.id ? 'bg-brand-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{c.name}</span>
                <span className="text-[11px] text-gray-400">{c.time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500 truncate">{c.last}</span>
                {c.unread > 0 && <span className="text-[10px] bg-brand-600 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">{c.unread}</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800">{active?.name}</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${
                  m.from === 'customer' ? 'bg-gray-100 text-gray-700' : m.suggestion ? 'bg-purple-50 border border-purple-200 text-purple-900' : 'bg-brand-600 text-white'
                }`}>
                  {m.suggestion && (
                    <p className="flex items-center gap-1 text-[10px] font-bold text-purple-500 mb-1 uppercase">
                      <IconSparkles width={12} height={12} /> Saran AI
                    </p>
                  )}
                  <p>{m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.from === 'customer' ? 'text-gray-400' : m.suggestion ? 'text-purple-400' : 'text-brand-100'}`}>{m.time}</p>
                  {m.suggestion && (
                    <button onClick={() => approveAi(m.text)} className="mt-2 text-[11px] font-semibold bg-purple-600 text-white px-2 py-1 rounded-lg">
                      Setujui & Kirim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {templates.map((t, i) => (
                <button key={i} onClick={() => send(t)} className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50">
                  {t.length > 24 ? t.slice(0, 24) + '…' : t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">📎 Lampirkan Gambar</button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">🛍️ Kirim Produk</button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">📦 Kirim Order (#ORD-...)</button>
            </div>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(draft)}
                placeholder="Tulis balasan..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={() => send(draft)} className="bg-brand-600 text-white px-4 rounded-lg">
                <IconSend />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconSend, IconSparkles } from '../components/icons'

const conversations = [
  { id: 1, name: 'Rina Wijaya', lastKey: 'conv_1_last', time: '10:32', unread: 2 },
  { id: 2, name: 'Joko Santoso', lastKey: 'conv_2_last', time: '09:15', unread: 0 },
  { id: 3, name: 'Maya Sari', lastKey: 'conv_3_last', time: 'yesterday', unread: 1 },
  { id: 4, name: 'Dedi Kurniawan', lastKey: 'conv_4_last', time: 'yesterday', unread: 0 },
]

const templateKeys = ['template_1', 'template_2', 'template_3', 'template_4']

const initialThread = [
  { from: 'customer', textKey: 'thread_customer_msg', time: '10:30' },
  { from: 'ai', textKey: 'thread_ai_msg', time: '10:32', suggestion: true },
]

export default function Chat() {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState(1)
  const [messages, setMessages] = useState(initialThread)
  const [draft, setDraft] = useState('')
  const active = conversations.find((c) => c.id === activeId)

  function send(text) {
    if (!text) return
    setMessages((m) => [...m, { from: 'seller', text, time: t('page_chat.time_now') }])
    setDraft('')
  }

  function approveAi(text) {
    setMessages((m) => [...m, { from: 'seller', text, time: t('page_chat.time_now') }])
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        {t('shared.mock_preview_badge')}
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
                <span className="text-[11px] text-gray-400">{c.time === 'yesterday' ? t('page_chat.time_yesterday') : c.time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500 truncate">{t(`page_chat.${c.lastKey}`)}</span>
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
                      <IconSparkles width={12} height={12} /> {t('page_chat.ai_suggestion_label')}
                    </p>
                  )}
                  <p>{m.textKey ? t(`page_chat.${m.textKey}`) : m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.from === 'customer' ? 'text-gray-400' : m.suggestion ? 'text-purple-400' : 'text-brand-100'}`}>{m.time}</p>
                  {m.suggestion && (
                    <button onClick={() => approveAi(m.textKey ? t(`page_chat.${m.textKey}`) : m.text)} className="mt-2 text-[11px] font-semibold bg-purple-600 text-white px-2 py-1 rounded-lg">
                      {t('page_chat.approve_send')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {templateKeys.map((key, i) => {
                const label = t(`page_chat.${key}`)
                return (
                  <button key={i} onClick={() => send(label)} className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50">
                    {label.length > 24 ? label.slice(0, 24) + '…' : label}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 mb-2">
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">{t('page_chat.attach_image')}</button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">{t('page_chat.send_product')}</button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">{t('page_chat.send_order')}</button>
            </div>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(draft)}
                placeholder={t('page_chat.input_placeholder')}
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

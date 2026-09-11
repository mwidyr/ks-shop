import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const notifications = [
  { icon: '⚠️', textKey: 'notif_low_stock', count: 12, timeKey: 'time_minutes_ago', timeCount: 10 },
  { icon: '🚚', textKey: 'notif_orders_to_ship', count: 5, timeKey: 'time_minutes_ago', timeCount: 25 },
  { icon: '↩️', textKey: 'notif_new_returns', count: 3, timeKey: 'time_hours_ago', timeCount: 1 },
  { icon: '⭐', textKey: 'notif_negative_reviews', count: 2, timeKey: 'time_hours_ago', timeCount: 2 },
  { icon: '📢', textKey: 'notif_campaign_ending', name: 'Flash Sale 9.9', timeKey: 'time_hours_ago', timeCount: 3 },
]

const channels = [
  { id: 'in_app', labelKey: 'channel_in_app' },
  { id: 'email', labelKey: 'channel_email' },
  { id: 'whatsapp', labelKey: 'channel_whatsapp' },
  { id: 'telegram', labelKey: 'channel_telegram' },
  { id: 'push', labelKey: 'channel_push' },
]

export default function Notifications() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState({ in_app: true, email: true, whatsapp: false, telegram: false, push: true })

  return (
    <div className="px-4 sm:px-6 py-6 grid md:grid-cols-3 gap-6 items-start">
      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">{t('page_notifications.heading')}</h2>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{t('page_notifications.preview_badge')}</span>
        </div>
        <div className="divide-y">
          {notifications.map((n, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span className="text-xl">{n.icon}</span>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  {n.name
                    ? t(`page_notifications.${n.textKey}`, { name: n.name })
                    : t(`page_notifications.${n.textKey}`, { count: n.count })}
                </p>
                <p className="text-xs text-gray-400">{t(`page_notifications.${n.timeKey}`, { count: n.timeCount })}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">{t('page_notifications.heading_channel')}</h2>
        <div className="space-y-3">
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{t(`page_notifications.${c.labelKey}`)}</span>
              <button
                onClick={() => setEnabled((e) => ({ ...e, [c.id]: !e[c.id] }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${enabled[c.id] ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${enabled[c.id] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

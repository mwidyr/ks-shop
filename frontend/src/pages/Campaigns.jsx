import MockPage from '../components/MockPage'

const campaigns = [
  { name: 'Flash Sale 9.9', channel: 'In-app', reach: '12.400', ends: '2 hari lagi' },
  { name: 'Live TikTok Weekend', channel: 'TikTok Live', reach: '8.200', ends: 'Berjalan' },
]

export default function Campaigns() {
  return (
    <MockPage icon="🎯" title="Campaigns" description="Kampanye pemasaran lintas kanal.">
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {campaigns.map((c) => (
          <div key={c.name} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{c.name}</p>
              <p className="text-xs text-gray-500">{c.channel} · Jangkauan {c.reach}</p>
            </div>
            <span className="text-xs font-semibold text-gray-500">{c.ends}</span>
          </div>
        ))}
      </div>
    </MockPage>
  )
}

import MockPage from '../components/MockPage'
import BigStatCard from '../components/BigStatCard'

export default function Advertising() {
  return (
    <MockPage icon="📢" title="Advertising" description="Kelola iklan produk dan pantau performanya.">
      <div className="flex flex-wrap gap-4">
        <BigStatCard title="Ad Spend" value="Rp 1.250.000" iconBg="bg-blue-50" iconColor="text-blue-600" icon="💰" />
        <BigStatCard title="Impressions" value="45.200" iconBg="bg-purple-50" iconColor="text-purple-600" icon="👁️" />
        <BigStatCard title="Clicks" value="1.840" iconBg="bg-green-50" iconColor="text-green-600" icon="🖱️" />
        <BigStatCard title="ROAS" value="3.2x" iconBg="bg-yellow-50" iconColor="text-yellow-600" icon="📈" />
      </div>
    </MockPage>
  )
}

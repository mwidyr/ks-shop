// `compact` (item 051) shrinks padding/icon/number size for pages that want a denser summary
// row - default (omitted) keeps the original larger card unchanged for every other page using
// this component (Dashboard, Customers, Advertising).
export default function BigStatCard({ title, value, subLabel, iconBg, iconColor, icon, compact = false }) {
  if (compact) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-3 flex-1 min-w-[140px]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500 truncate">{title}</p>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
            <span className={`${iconColor} text-xs`}>{icon}</span>
          </div>
        </div>
        <p className="text-lg font-extrabold text-gray-800">{value}</p>
        {subLabel && <p className="text-[10px] text-gray-400 mt-0.5">{subLabel}</p>}
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 flex-1 min-w-[200px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{title}</p>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-extrabold text-gray-800">{value}</p>
      {subLabel && <p className="text-xs text-gray-400 mt-1">{subLabel}</p>}
    </div>
  )
}

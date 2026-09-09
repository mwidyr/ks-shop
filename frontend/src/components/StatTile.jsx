export default function StatTile({ label, value, colorClass }) {
  return (
    <div className={`rounded-2xl p-5 ${colorClass}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="text-3xl font-extrabold mt-1">{value}</p>
    </div>
  )
}

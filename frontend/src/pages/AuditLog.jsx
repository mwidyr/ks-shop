const entries = [
  { actor: 'admin01', action: 'Changed price', entity: 'SKU-001', oldValue: 'Rp500.000', newValue: 'Rp550.000', time: '10:32', ip: '10.0.0.4' },
  { actor: 'admin01', action: 'Updated stock', entity: 'SKU-003', oldValue: '100', newValue: '80', time: '10:35', ip: '10.0.0.4' },
  { actor: 'sales1', action: 'Cancelled order', entity: 'ORD-123', oldValue: 'pending', newValue: 'cancelled', time: '10:40', ip: '10.0.0.7' },
  { actor: 'management', action: 'Deactivated product', entity: 'SKU-011', oldValue: 'active', newValue: 'nonaktif', time: '11:02', ip: '10.0.0.2' },
  { actor: 'superuser', action: 'Updated fee settings', entity: 'platform_fee_pct', oldValue: '2%', newValue: '2.5%', time: '11:20', ip: '10.0.0.1' },
]

export default function AuditLog() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-3">Waktu</th>
              <th className="p-3">Actor</th>
              <th className="p-3">Aksi</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Perubahan</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="p-3 text-gray-500">{e.time}</td>
                <td className="p-3 font-medium text-gray-800">{e.actor}</td>
                <td className="p-3 text-gray-700">{e.action}</td>
                <td className="p-3 font-mono text-xs text-gray-600">{e.entity}</td>
                <td className="p-3 text-gray-500">{e.oldValue} → <span className="text-gray-800 font-medium">{e.newValue}</span></td>
                <td className="p-3 text-gray-400 text-xs">{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const roles = ['Owner', 'Admin', 'Warehouse', 'Customer Service', 'Finance', 'Marketing']
const permissions = [
  { name: 'Products', access: [true, true, false, false, false, false] },
  { name: 'Orders', access: [true, true, true, true, false, false] },
  { name: 'Inventory', access: [true, true, true, false, false, false] },
  { name: 'Finance', access: [true, false, false, false, true, false] },
  { name: 'Ads', access: [true, true, false, false, false, true] },
  { name: 'Customer Chat', access: [true, true, false, true, false, false] },
]

const staff = [
  { name: 'Super Admin', email: 'superuser@demo.com', role: 'Owner' },
  { name: 'Budi Management', email: 'management@demo.com', role: 'Admin' },
  { name: 'Sari SPV', email: 'spv@demo.com', role: 'Warehouse' },
  { name: 'Andi Sales', email: 'sales1@demo.com', role: 'Customer Service' },
]

export default function RolesMatrix() {
  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Staff</h2>
          <button className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">+ Undang Staff</button>
        </div>
        <div className="divide-y">
          {staff.map((s) => (
            <div key={s.email} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-500">{s.email}</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{s.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-4">Permission Matrix</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">Permission</th>
              {roles.map((r) => <th key={r} className="p-2 text-center">{r}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {permissions.map((p) => (
              <tr key={p.name}>
                <td className="p-2 font-medium text-gray-700">{p.name}</td>
                {p.access.map((ok, i) => (
                  <td key={i} className="p-2 text-center">
                    {ok ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">✕</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

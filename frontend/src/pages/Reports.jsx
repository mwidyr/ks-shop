import { useState } from 'react'

const reportTypes = [
  'Sales Report', 'Order Report', 'Product Report', 'Inventory Report',
  'Customer Report', 'Profit Report', 'Tax Report', 'Advertising Report', 'Settlement Report',
]
const formats = ['CSV', 'Excel', 'PDF']

export default function Reports() {
  const [toast, setToast] = useState('')

  function exportReport(name, format) {
    setToast(`${name} (${format}) akan segera hadir`)
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <span className="inline-block mb-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        Preview — belum terhubung ke data asli
      </span>
      {toast && <div className="mb-4 text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg">{toast}</div>}
      <div className="bg-white rounded-2xl shadow-sm divide-y">
        {reportTypes.map((name) => (
          <div key={name} className="flex items-center justify-between p-4">
            <span className="text-sm font-medium text-gray-800">{name}</span>
            <div className="flex gap-2">
              {formats.map((f) => (
                <button
                  key={f}
                  onClick={() => exportReport(name, f)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

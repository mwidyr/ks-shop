// Generic placeholder for spec'd modules that aren't wired to a backend yet.
// `children` can carry a bit of static sample content so the page isn't blank.
export default function MockPage({ icon, title, description, children }) {
  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center text-2xl mx-auto mb-4">
          {icon}
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">{title}</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">{description}</p>
        <span className="inline-block mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
          Preview — belum terhubung ke data asli
        </span>
      </div>
      {children}
    </div>
  )
}

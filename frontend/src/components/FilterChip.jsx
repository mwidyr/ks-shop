import { IconChevronDown, IconClose } from './icons'

// Reusable pill-style filter control: an outlined chip that becomes a solid
// brand-colored pill with a clear ("x") affordance once a value is applied.
export default function FilterChip({ label, active, onClick, onClear }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? 'bg-brand-600 border-brand-600 text-white'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
      {active && onClear ? (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="hover:opacity-70"
        >
          <IconClose width={13} height={13} />
        </span>
      ) : (
        <IconChevronDown width={13} height={13} />
      )}
    </button>
  )
}

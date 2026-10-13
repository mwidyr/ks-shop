// 1-5 star rating (display). Colour: --color-warning; empty stars use the border colour.
export default function Stars({ value = 0, size = 16 }) {
  return (
    <span role="img" aria-label={`${value} / 5`} style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={i <= value ? 'var(--color-warning)' : 'var(--color-border)'}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </svg>
      ))}
    </span>
  )
}

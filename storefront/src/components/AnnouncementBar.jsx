// Homepage announcement bar (admin: Home Modules > Announcement bar): a news-ticker marquee that scrolls the
// messages continuously from right to left, in the order staff set. Pauses on hover; under reduced motion
// it stops and wraps as plain text (see index.css).
const SECONDS_PER_CHAR = 0.16
const MIN_SECONDS = 14

export default function AnnouncementBar({ messages }) {
  const n = messages.length
  if (n === 0) return null
  const chars = messages.reduce((sum, m) => sum + m.length + 6, 0)
  const copy = (hidden) => (
    <span className="announce-copy" aria-hidden={hidden || undefined}>
      {messages.map((m, k) => (
        <span key={k} className="announce-item">{m}<span className="announce-dot" aria-hidden="true">◆</span></span>
      ))}
    </span>
  )
  return (
    <div role="status" data-testid="announcement-bar" className="announce-bar">
      <div className="announce-track" style={{ animationDuration: `${Math.max(MIN_SECONDS, chars * SECONDS_PER_CHAR)}s` }}>
        {copy(false)}{copy(true)}
      </div>
    </div>
  )
}

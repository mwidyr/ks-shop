import { IconMegaphone } from './Icons'

// Homepage announcement bar (admin: Home Modules > Announcement bar): the megaphone stays fixed on the left and
// only the text scrolls, continuously and seamlessly from right to left, in the order staff set, with a fixed
// 32px gap between announcements. Pauses on hover; under reduced motion it stops and wraps as plain text
// (see index.css).
const SECONDS_PER_CHAR = 0.16
const MIN_SECONDS = 14

export default function AnnouncementBar({ messages }) {
  const n = messages.length
  if (n === 0) return null
  const chars = messages.reduce((sum, m) => sum + m.length + 4, 0)
  const copy = (hidden) => (
    <span className="announce-copy" aria-hidden={hidden || undefined}>
      {messages.map((m, k) => <span key={k} className="announce-item">{m}</span>)}
    </span>
  )
  return (
    <div role="status" data-testid="announcement-bar" className="announce-bar">
      <span className="announce-icon"><IconMegaphone size={20} /></span>
      <div className="announce-clip">
        <div className="announce-track" style={{ animationDuration: `${Math.max(MIN_SECONDS, chars * SECONDS_PER_CHAR)}s` }}>
          {copy(false)}{copy(true)}
        </div>
      </div>
    </div>
  )
}

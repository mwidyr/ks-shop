import { useEffect, useState } from 'react'

// Homepage announcement bar (admin: Home Modules > Announcement bar): shows the messages one after another,
// each for a few seconds, in the order staff set. A single message just stays.
const SHOW_MS = 4000

export default function AnnouncementBar({ messages }) {
  const [i, setI] = useState(0)
  const n = messages.length
  useEffect(() => {
    if (n < 2) return undefined
    const id = setInterval(() => setI((k) => (k + 1) % n), SHOW_MS)
    return () => clearInterval(id)
  }, [n])
  if (n === 0) return null
  return (
    <div role="status" aria-live="polite" data-testid="announcement-bar" style={{ margin: '10px 16px 0', minHeight: 40, padding: '8px 14px', borderRadius: 12, background: 'var(--color-primary-soft)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 14, fontWeight: 500, lineHeight: 1.35, boxSizing: 'border-box' }}>
      <span key={i % n} className="announce-msg">{messages[i % n]}</span>
    </div>
  )
}

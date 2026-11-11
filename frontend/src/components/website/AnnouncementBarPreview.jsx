import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Homepage announcement bar, typewriter style (Ralulu Marquee Spec v4; admin: Home Modules > Announcement bar).
// One message at a time: it types out, holds, erases, then the next one starts, forever. The loop is driven by
// JavaScript, one character per tick (Chinese glyphs are proportional, so a CSS width animation would break).
// Pauses on hover / focus / press-and-hold and while the page is hidden. Under prefers-reduced-motion nothing
// types or blinks: the first message shows in full. The bar is a "Promotions" region; a visually hidden line
// carries the full current message once per message. When the message has a link, the whole bar is that link.
// NOTE: copy of storefront/src/components/AnnouncementBar.jsx for the admin preview (plain <a> instead of the
// router Link, and links do not navigate in the preview); keep the typing logic in sync.

const CSS = `
.ra-cursor{display:inline-block;flex:none;width:8px;height:18px;margin-left:4px;animation:ra-blink 1s steps(1) infinite}
@keyframes ra-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
.ra-bar:focus-visible{outline:3px solid #1A1A1A;outline-offset:2px;box-shadow:0 0 0 5px #fff}
.ra-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){.ra-cursor{animation:none}}
`

const FAMILY = '"Courier New", ui-monospace, monospace, "Noto Sans TC", sans-serif'
const segment = (s) => (typeof Intl !== 'undefined' && Intl.Segmenter ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s))

export function useReducedMotion() {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    const f = () => setOn(mq.matches)
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [])
  return on
}

export default function AnnouncementBar({ bar, reducedMotion, forcePause = false }) {
  const detected = useReducedMotion()
  const reduced = reducedMotion ?? detected
  const messages = bar?.messages || []
  const chars = useMemo(() => messages.map((m) => segment(m.text)), [messages])
  const [i, setI] = useState(0)
  const [n, setN] = useState(0)
  const [phase, setPhase] = useState('typing')
  const [held, setHeld] = useState(false) // hover / focus / press
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const [small, setSmall] = useState(false)
  const textRef = useRef(null)
  const measureRef = useRef(null)
  const count = messages.length
  const idx = count ? i % count : 0
  const cur = messages[idx]
  const full = chars[idx] || []
  const t = bar?.timing || {}
  const paused = held || hidden || forcePause

  useEffect(() => {
    const f = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])

  // the config changed (new messages): start over
  const sig = JSON.stringify(messages)
  useEffect(() => { setI(0); setN(0); setPhase('typing') }, [sig])

  useEffect(() => {
    if (reduced || paused || !count) return undefined
    let delay
    let next
    if (phase === 'typing') {
      if (n < full.length) { delay = t.typeMs; next = () => setN(n + 1) } else { delay = 0; next = () => setPhase('hold') }
    } else if (phase === 'hold') {
      delay = t.holdMs; next = () => setPhase('erasing')
    } else if (phase === 'erasing') {
      if (n > 0) { delay = t.eraseMs; next = () => setN(n - 1) } else { delay = 0; next = () => setPhase('pause') }
    } else {
      delay = t.pauseMs; next = () => { setI((idx + 1) % count); setPhase('typing') }
    }
    const id = setTimeout(next, delay)
    return () => clearTimeout(id)
  }, [reduced, paused, count, phase, n, idx, full.length, t.typeMs, t.holdMs, t.eraseMs, t.pauseMs])

  // a message wider than the bar drops to 14px (that message only); never wraps
  useLayoutEffect(() => {
    const check = () => {
      const box = textRef.current
      const probe = measureRef.current
      if (!box || !probe) return
      setSmall(probe.scrollWidth > box.clientWidth && box.clientWidth > 0)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [idx, sig, bar?.style?.fontSize])

  if (!count || !cur) return null
  const s = bar.style
  const shown = reduced ? cur.text : full.slice(0, n).join('')
  const fontSize = small ? 14 : s.fontSize
  const font = `400 ${fontSize}px/1 ${FAMILY}`
  const barStyle = {
    display: 'flex', alignItems: 'center', boxSizing: 'border-box', height: 52, padding: '0 16px', borderRadius: s.radius, overflow: 'hidden',
    background: s.background, color: s.text, textDecoration: 'none', position: 'relative',
    border: s.background.toUpperCase() === '#FFFFFF' ? '1px solid #E3D5DA' : 'none',
  }
  const handlers = {
    onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false),
    onFocus: () => setHeld(true), onBlur: () => setHeld(false),
    onPointerDown: () => setHeld(true), onPointerUp: () => setHeld(false), onPointerCancel: () => setHeld(false),
  }
  const inner = (
    <>
      {s.showPrompt && <span aria-hidden="true" style={{ color: s.accent, fontSize: 16, marginRight: 10, flex: 'none', fontFamily: FAMILY }}>&gt;</span>}
      <span ref={textRef} aria-live="off" style={{ flex: 1, minWidth: 0, font, color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', letterSpacing: 0 }}>{shown}</span>
      <span className="ra-cursor" aria-hidden="true" style={{ background: s.accent }} />
      <span ref={measureRef} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap', font: `400 ${s.fontSize}px/1 ${FAMILY}` }}>{cur.text}</span>
      <span className="ra-sr">{cur.text}</span>
    </>
  )
  let bodyEl
  if (cur.url) bodyEl = <a href={cur.url} onClick={(e) => e.preventDefault()} className="ra-bar" style={barStyle} {...handlers}>{inner}</a>
  else bodyEl = <div className="ra-bar" style={barStyle} {...handlers}>{inner}</div>
  return (
    <div role="region" aria-label="Promotions" data-testid="announcement-bar">
      <style>{CSS}</style>
      {bodyEl}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { img, onImgError, sized } from '../lib/api'

const INTERVAL = 5000

// Homepage banner carousel (#144): scroll-snap (swipe on phones, trackpad / arrows on desktop), auto-rotates every
// 5 s, pauses while touched / hovered / the tab is hidden, and stays still for visitors who prefer reduced motion.
function Slide({ b, first, desktop }) {
  const image = <img src={sized(img(b.image_url), 1600)} alt={b.alt || ''} fetchpriority={first ? 'high' : undefined} loading={first ? undefined : 'lazy'} draggable={false} onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
  const box = { flex: 'none', width: '100%', height: '100%', scrollSnapAlign: 'start', display: 'block', background: 'var(--color-bg-soft)' }
  const l = b.link_url
  if (!l) return <div style={box}>{image}</div>
  if (l.startsWith('/') && !l.startsWith('//')) return <Link to={l} style={box} draggable={false}>{image}</Link>
  return <a href={l} target="_blank" rel="noopener noreferrer" style={box} draggable={false}>{image}</a>
}

export default function BannerCarousel({ banners, desktop }) {
  const ref = useRef(null)
  const [index, setIndex] = useState(0)
  const paused = useRef(false)
  const n = banners.length

  const go = useCallback((i) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    if (n < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = setInterval(() => {
      if (paused.current || document.hidden) return
      go((index + 1) % n)
    }, INTERVAL)
    return () => clearInterval(id)
  }, [n, index, go])

  const onScroll = () => {
    const el = ref.current
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }
  const hold = (v) => () => { paused.current = v }

  return (
    <section aria-roledescription="carousel" style={{ position: 'relative', margin: desktop ? 0 : '14px 16px 0', aspectRatio: desktop ? '8 / 3' : '2 / 1', maxHeight: desktop ? 440 : undefined, borderRadius: desktop ? 24 : 18, overflow: 'hidden', background: 'var(--color-bg-soft)' }}
      onMouseEnter={hold(true)} onMouseLeave={hold(false)} onTouchStart={hold(true)} onTouchEnd={hold(false)} onFocus={hold(true)} onBlur={hold(false)}>
      <div ref={ref} onScroll={onScroll} className="no-scrollbar" data-testid="banner-track" style={{ display: 'flex', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain' }}>
        {banners.map((b, i) => <Slide key={b.id} b={b} first={i === 0} desktop={desktop} />)}
      </div>
      {n > 1 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {banners.map((b, i) => (
            <button key={b.id} type="button" aria-label={`${i + 1} / ${n}`} aria-current={i === index} onClick={() => go(i)}
              style={{ width: i === index ? 18 : 8, height: 8, padding: 0, border: 0, borderRadius: 4, background: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.55)', boxShadow: '0 0 2px rgba(0,0,0,0.4)', cursor: 'pointer', transition: 'width .2s' }} />
          ))}
        </div>
      )}
    </section>
  )
}

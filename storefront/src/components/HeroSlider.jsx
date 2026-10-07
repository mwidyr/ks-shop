import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { img } from '../lib/api'
import { ChevronLeft, ChevronRight } from './Icons'

// Auto-advancing hero. Slides are built from live data (newest products), so it never shows a
// stale banner; swap in uploaded banner images later without touching the layout.
export default function HeroSlider({ slides }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (slides.length < 2) return undefined
    const t = setInterval(() => setI((n) => (n + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length])

  if (slides.length === 0) {
    return <div className="aspect-[16/7] bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center text-white font-display text-5xl">RALULU</div>
  }
  const go = (d) => setI((n) => (n + d + slides.length) % slides.length)
  return (
    <section className="relative overflow-hidden bg-gray-900 h-[420px] sm:h-[520px] lg:h-[600px]">
      {slides.map((s, idx) => (
        <div key={s.key} className={`absolute inset-0 transition-opacity duration-700 ${idx === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {s.image && <img src={img(s.image)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />
          <div className="relative h-full max-w-7xl mx-auto px-6 flex flex-col justify-center text-white">
            <p className="text-xs sm:text-sm uppercase tracking-[0.3em]">{s.eyebrow}</p>
            <h2 className="font-display text-5xl sm:text-7xl lg:text-8xl leading-none mt-3 max-w-xl">{s.title}</h2>
            {s.text && <p className="mt-4 max-w-md text-sm sm:text-base text-gray-200 line-clamp-3">{s.text}</p>}
            <Link to={s.to} className="btn bg-white text-black hover:bg-brand-600 hover:text-white mt-7 self-start">{s.cta}</Link>
          </div>
        </div>
      ))}
      {slides.length > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white hidden sm:block" aria-label="Sebelumnya"><ChevronLeft width={34} height={34} /></button>
          <button onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white hidden sm:block" aria-label="Berikutnya"><ChevronRight width={34} height={34} /></button>
          <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2">
            {slides.map((s, idx) => <button key={s.key} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} className={`h-1.5 transition-all ${idx === i ? 'w-8 bg-white' : 'w-4 bg-white/50'}`} />)}
          </div>
        </>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'

export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [match, setMatch] = useState(get)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}
// Desktop layout (≥1024): top navigation, wider grids. Below that: the 390px mobile design.
export const useDesktop = () => useMedia('(min-width: 1024px)')

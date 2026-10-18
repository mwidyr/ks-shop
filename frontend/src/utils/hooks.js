import { useEffect, useState } from 'react'

// The value, but only after it has stopped changing for `delay` ms - for search boxes, so typing does
// not fire one request per keystroke.
// Search boxes use this delay and never wait for a minimum number of characters.
export const SEARCH_DEBOUNCE_MS = 150

export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// True while the viewport matches the media query (e.g. '(min-width: 768px)'). Lets a page render ONE
// layout (table or cards) instead of both with one hidden by CSS, which doubled the DOM and the images.
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Client-side paging of an already loaded list: the rows of the current page and the controls' numbers.
export function pageSlice(list, page, size) {
  const totalPages = Math.max(1, Math.ceil(list.length / size))
  const safe = Math.min(Math.max(1, page), totalPages)
  return { rows: list.slice((safe - 1) * size, safe * size), page: safe, totalPages, total: list.length }
}

import { useCallback, useEffect, useRef, useState } from 'react'

// Brief success/info message that removes itself: `const { toast, showToast } = useToast()`, render `<Toast toast={toast} />`.
export const TOAST_MS = 2500

export function useToast(duration = TOAST_MS) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const showToast = useCallback((text, ok = true) => {
    clearTimeout(timer.current)
    setToast({ text, ok, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), duration)
  }, [duration])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { toast, showToast }
}

export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div
      role="status" aria-live="polite"
      className={`fixed top-4 right-4 z-[60] rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
    >
      {toast.text}
    </div>
  )
}

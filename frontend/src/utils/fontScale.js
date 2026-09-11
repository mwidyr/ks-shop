export const FONT_SCALES = [
  { value: 1, key: 'font_standard' },
  { value: 1.125, key: 'font_large' },
  { value: 1.25, key: 'font_xlarge' },
  { value: 1.375, key: 'font_xxlarge' },
]

export function getFontScale() {
  try {
    const saved = parseFloat(localStorage.getItem('fontScale'))
    if (FONT_SCALES.some((f) => f.value === saved)) return saved
  } catch {
    // ignore storage errors
  }
  return 1
}

export function applyFontScale(scale) {
  document.documentElement.style.setProperty('--font-scale', String(scale))
  try {
    localStorage.setItem('fontScale', String(scale))
  } catch {
    // ignore storage errors
  }
}

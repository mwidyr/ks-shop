export function getDarkMode() {
  try {
    return localStorage.getItem('darkMode') === 'true'
  } catch {
    return false
  }
}

export function applyDarkMode(enabled) {
  document.documentElement.classList.toggle('dark', enabled)
  try {
    localStorage.setItem('darkMode', String(enabled))
  } catch {
    // ignore storage errors
  }
}

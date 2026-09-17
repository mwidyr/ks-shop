// navigator.clipboard requires a secure context (HTTPS or localhost) - on a plain-HTTP
// deployment (e.g. a raw-IP VPS with no domain/TLS) it's simply unavailable, and calling it
// throws. Falls back to the legacy execCommand('copy') trick, which still works over HTTP in
// most browsers. Returns true only if the text actually made it to the clipboard.
export async function copyToClipboard(text) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy method below
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.top = '0'
    textarea.style.left = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

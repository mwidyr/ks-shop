import DOMPurify from 'dompurify'

// Inline article formatting (bold / italic / links / line breaks) written in the admin editor. The backend
// already sanitises it on save; this is the second line of defence at render time.
const purify = DOMPurify(typeof window !== 'undefined' ? window : undefined)
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener')
    const href = node.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) node.setAttribute('target', '_blank')
  }
})
export const safeHtml = (html) => purify.sanitize(html || '', { ALLOWED_TAGS: ['strong', 'em', 'a', 'br'], ALLOWED_ATTR: ['href', 'rel', 'target'], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/(?!\/))/i })

// Reads a date typed by hand into "YYYY-MM-DD" (null when it is not a real calendar date). Accepts the ISO form and the
// ones people actually type: 1990-12-25, 1990/12/25, 25-12-1990, 25/12/1990, 25.12.1990, 19901225 and 25121990.
const MIN_YEAR = 1900
const MAX_YEAR = 2100

function realDate(y, m, d) {
  if (y < MIN_YEAR || y > MAX_YEAR) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseDateText(text) {
  const s = String(text ?? '').trim()
  let m
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return realDate(+m[1], +m[2], +m[3])
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return realDate(+m[3], +m[2], +m[1])
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return realDate(+m[1], +m[2], +m[3]) || realDate(+s.slice(4), +s.slice(2, 4), +s.slice(0, 2))
  return null
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseDateText(s) === s

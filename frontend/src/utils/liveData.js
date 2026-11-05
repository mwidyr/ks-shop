// LIVE Data Portal helpers: TikTok's analytics needs 2 screenshots - the "Penonton" tab and the "Engagement" tab.
// Hosts upload them in any order; the server reads each image on its own and says which tab it is.

export function secondsToMMSS(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return ''
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function mmssToSeconds(text) {
  const match = /^(\d+):(\d{1,2})$/.exec((text || '').trim())
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

export const MAX_SCREENSHOTS = 4

// images: [{ url, status: 'uploading' | 'reading' | 'done' | 'error', data }]  (data = the server's answer for that image,
// absent when the AI could not read it - the host then types the numbers).
// Returns which tabs are present, what is wrong with the set (to show next to the thumbnails) and the merged numbers.
export function analyzeScreenshots(images) {
  const busy = images.some((i) => i.status === 'uploading' || i.status === 'reading')
  const read = images.filter((i) => i.status === 'done' && i.data)
  const unreadable = images.filter((i) => i.status === 'done' && !i.data) // AI failed: manual entry is still possible
  const tabOf = (i) => i.data.tab
  const viewers = read.filter((i) => tabOf(i) === 'penonton')
  const engagement = read.filter((i) => tabOf(i) === 'engagement')
  const other = read.filter((i) => tabOf(i) !== 'penonton' && tabOf(i) !== 'engagement')

  const problems = []
  if (other.length) problems.push({ code: 'not_recognised', urls: other.map((i) => i.url) })
  if (viewers.length > 1) problems.push({ code: 'duplicate_penonton', urls: viewers.map((i) => i.url) })
  if (engagement.length > 1) problems.push({ code: 'duplicate_engagement', urls: engagement.map((i) => i.url) })

  const hasViewers = viewers.length > 0
  const hasEngagement = engagement.length > 0
  // the AI read at least one image: tell which tab is missing; all unreadable: only the manual path is left
  const missing = []
  if (read.length > 0 && !busy) {
    if (!hasViewers && unreadable.length === 0) missing.push('penonton')
    if (!hasEngagement && unreadable.length === 0) missing.push('engagement')
  }

  const first = (list, key) => {
    for (const i of list) if (i.data[key] != null) return i.data[key]
    return null
  }
  const merged = {
    views: first(viewers, 'views'), uv: first(viewers, 'uv'), active_viewers: first(viewers, 'active_viewers'),
    awt_seconds: first(viewers, 'awt_seconds'), pcu: first(viewers, 'pcu'), acu: first(viewers, 'acu'),
    follows: first(engagement, 'follows'), chats: first(engagement, 'chats'), shares: first(engagement, 'shares'), likes: first(engagement, 'likes'),
    live_duration_seconds: first([...viewers, ...engagement], 'live_duration_seconds'),
  }

  // ready = both required tabs were recognised exactly once and nothing is still being read
  const ready = !busy && hasViewers && hasEngagement && problems.length === 0
  // manual = the AI could not read the images (down / not configured): let the host continue and type the numbers
  const manual = !busy && read.length === 0 && unreadable.length >= 2
  // the screenshots that are saved with the LIVE session
  const saveUrls = ready ? [viewers[0].url, engagement[0].url] : images.filter((i) => i.url).map((i) => i.url)
  return { busy, ready, manual, problems, missing, hasViewers, hasEngagement, merged, saveUrls }
}

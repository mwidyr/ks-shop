// Mirrors backend/internal/telegram/logic.go so the preview shows exactly what Telegram will get.

export const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// {celebration_effect}: the emoji repeated milestone/10 times, at most 10.
export const celebrationEffect = (emoji, milestone) => (emoji || '').repeat(clampInt(Math.floor(milestone / 10), 0, 10))

// Host Milestone sends the same message milestone/10 times (3..10).
export const repeatCount = (milestone) => clampInt(Math.floor(milestone / 10), 1, 10)

export const hostName = (name) => (name || '').trim().split(/\s+/).join(' ').toUpperCase()

export function renderTemplate(template, vars) {
  return (template || '').replace(/\{([a-z_]+)\}/g, (m, key) => (key in vars ? vars[key] : m))
}

export function templateVars(type, cfg, v) {
  return {
    host_name: hostName(v.hostName), location_name: v.locationName || '',
    milestone: String(v.milestone ?? 0), qty: String(v.qty ?? 0),
    previous_best: String(v.previousBest ?? 0), new_best: String(v.newBest ?? 0),
    date: v.date,
    celebration_effect: type === 'host_milestone' ? celebrationEffect(cfg.emoji, Number(v.milestone) || 0) : '',
  }
}

export const DEFAULT_TEMPLATES = {
  host_milestone: '🏆 CONGRATULATIONS 🏆\n{celebration_effect}\n{host_name} TEMBUS {milestone} PCS!\n{celebration_effect}',
  personal_best: '🏆 NEW PERSONAL BEST! 🏆\n\n🎉 CONGRATULATIONS {host_name}!\n\nPrevious Best: {previous_best} PCS\nNew Record: {new_best} PCS',
  location_milestone: '🎉 LOCATION MILESTONE! 🎉\n\n{location_name} TEMBUS {milestone} PCS!\n\nTotal QTY: {qty} PCS',
  global_host_milestone: '🌟 GLOBAL HOST MILESTONE! 🌟\n\n🏆 {host_name} – {location_name}\n\nTEMBUS {milestone} PCS!\n\nTotal QTY: {qty} PCS',
}

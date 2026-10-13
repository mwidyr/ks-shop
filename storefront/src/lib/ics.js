// "Remind me": download an .ics event for the host's announced live (no push service needed).
export function downloadLiveReminder({ title, startIso, url }) {
  const d = new Date(startIso)
  if (Number.isNaN(d.getTime())) return
  const f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = new Date(d.getTime() + 60 * 60 * 1000)
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ralulu//live//EN', 'BEGIN:VEVENT', `UID:${f(d)}@ralulu`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`,
    `SUMMARY:${String(title).replace(/[,;\n]/g, ' ')}`, url ? `URL:${url}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:ralulu live', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n')
  const blob = new Blob([body], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ralulu-live.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

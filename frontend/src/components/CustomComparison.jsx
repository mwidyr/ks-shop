import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCustomComparison } from '../api/performanceComparison'
import { listLocations } from '../api/hostLocations'
import { listHosts } from '../api/hosts'
import { listAffiliates } from '../api/affiliates'
import { cardClasses } from './Table'
import SalesChannelFilter from './SalesChannelFilter'
import PeriodPicker from './PeriodPicker'
import ComparisonResults from './ComparisonResults'

const GROUP_COLORS = ['#9E1B46', '#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#4B5563']
const letter = (n) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '')

function Chevron({ open }) {
  return (
    <svg className={`w-4 h-4 shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4l6 6-6 6V4z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10M9 9v4M11 9v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

let nextId = 1
const newGroup = (n, name) => ({
  id: nextId++, index: n, name, open: true,
  channel: 'all', locationId: '', hostId: '', affiliateId: '',
  inherited: true, presetKey: 'inherit', range: null,
})

// Section 2 of the Performance Comparison page: any number of independently filtered groups,
// compared against one Baseline.
export default function CustomComparison({ pageRange }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState(() => [newGroup(0, 'Group A')])
  const [baselineId, setBaselineId] = useState(groups[0].id)
  const [results, setResults] = useState({}) // id -> { loading, data, key }
  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [affiliates, setAffiliates] = useState([])
  const counter = useRef(1)
  const [editingId, setEditingId] = useState(null)
  const requested = useRef({}) // id -> query key already sent (avoids duplicate requests)

  useEffect(() => { listLocations().then(setLocations).catch(() => {}) }, [])
  useEffect(() => { listHosts(false).then(setHosts) }, [])
  useEffect(() => { listAffiliates().then(setAffiliates).catch(() => {}) }, [])

  const effectiveRange = (g) => (g.inherited || !g.range ? pageRange : g.range)
  const queryKey = (g) => JSON.stringify([g.channel, g.channel === 'live' ? [g.locationId, g.hostId] : null, g.channel === 'website' ? g.affiliateId : null, effectiveRange(g)])

  // Refetch only the groups whose filters / effective range changed.
  useEffect(() => {
    groups.forEach((g) => {
      const key = queryKey(g)
      if (requested.current[g.id] === key) return
      requested.current[g.id] = key
      setResults((r) => ({ ...r, [g.id]: { loading: true, data: r[g.id]?.data, key } }))
      getCustomComparison({ ...g, range: effectiveRange(g) })
        .then((data) => setResults((r) => (r[g.id]?.key === key ? { ...r, [g.id]: { loading: false, data, key } } : r)))
        .catch(() => setResults((r) => (r[g.id]?.key === key ? { ...r, [g.id]: { loading: false, data: null, key } } : r)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, pageRange])

  const update = (id, patch) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const allOpen = groups.every((g) => g.open)

  function add() {
    // Default name = first "Group X" letter not currently in use, so deleting then adding reuses it.
    const used = new Set(groups.map((x) => x.name))
    let n = 0
    while (used.has(`${t('page_performance_comparison.group')} ${letter(n)}`)) n++
    const g = newGroup(counter.current++, `${t('page_performance_comparison.group')} ${letter(n)}`)
    setGroups((gs) => [...gs, g])
  }
  function remove(id) {
    if (groups.length === 1) return
    const rest = groups.filter((g) => g.id !== id)
    setGroups(rest)
    if (baselineId === id) setBaselineId(rest[0].id)
  }

  function summary(g) {
    const parts = [t(`shared.sales_channel_${g.channel}`)]
    if (g.channel === 'live') {
      parts.push(g.locationId ? locations.find((l) => String(l.id) === String(g.locationId))?.name : t('page_performance_comparison.all_locations'))
      parts.push(g.hostId ? hosts.find((h) => String(h.id) === String(g.hostId))?.name : t('page_performance_comparison.all_hosts'))
    } else if (g.channel === 'website') {
      const a = g.affiliateId
      parts.push(a === '' ? t('shared.all_affiliates') : a === 'cs' ? t('shared.website_created_by_cs') : a === 'self_service' ? t('shared.website_self_service') : affiliates.find((x) => String(x.id) === String(a))?.name)
    } else {
      parts.push(t('page_performance_comparison.entire_company'))
    }
    parts.push(g.inherited ? t('page_performance_comparison.page_date_short') : rangeLabel(g.range))
    return parts.filter(Boolean).join(' · ')
  }
  const rangeLabel = (r) => (!r ? '' : r.allTime ? t('page_performance_comparison.date_all_time') : r.from === r.to ? r.from : `${r.from} → ${r.to}`)

  const rows = useMemo(() => groups.map((g) => ({
    id: g.id, label: g.name, color: GROUP_COLORS[g.index % GROUP_COLORS.length],
    loading: results[g.id]?.loading, data: results[g.id]?.data ?? null, channel: g.channel,
    isBaseline: g.id === baselineId,
  })), [groups, results, baselineId, t])

  return (
    <div className="space-y-4">
      <div className={`${cardClasses} p-4 space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">{t('page_performance_comparison.section_custom')}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{t('page_performance_comparison.custom_subtitle')}</p>
          </div>
          <button onClick={() => setGroups((gs) => gs.map((g) => ({ ...g, open: !allOpen })))} className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">
            {allOpen ? t('page_performance_comparison.collapse_all') : t('page_performance_comparison.expand_all')}
          </button>
        </div>

        {groups.map((g) => {
          const isBase = g.id === baselineId
          const color = GROUP_COLORS[g.index % GROUP_COLORS.length]
          return (
            <div key={g.id} className="rounded-xl border p-3 space-y-3" style={{ borderColor: isBase ? color : 'var(--table-divider)' }}>
              <div className="flex items-center gap-2">
                <button onClick={() => update(g.id, { open: !g.open })} className="shrink-0 p-1" aria-expanded={g.open} aria-label={t(g.open ? 'page_performance_comparison.collapse' : 'page_performance_comparison.expand')}>
                  <Chevron open={g.open} />
                </button>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {editingId === g.id ? (
                    <input
                      ref={(el) => { if (el && document.activeElement !== el) { el.focus(); el.select() } }}
                      defaultValue={g.name} maxLength={30}
                      onBlur={(e) => { update(g.id, { name: e.target.value.trim() || g.name }); setEditingId(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = g.name; e.target.blur() } }}
                      className="text-xs font-bold border border-gray-300 rounded-md px-2 py-1 w-40 max-w-full bg-transparent text-[var(--text-primary)]"
                    />
                  ) : (
                    <>
                      <span onClick={() => update(g.id, { open: !g.open })} className="text-xs font-bold text-white px-2.5 py-1 rounded-md truncate max-w-[160px] cursor-pointer" style={{ background: isBase ? color : '#6B7280' }} title={g.name}>
                        {g.name}
                      </span>
                      <button onClick={() => setEditingId(g.id)} aria-label={t('page_performance_comparison.rename_group')} title={t('page_performance_comparison.rename_group')} className="p-1 rounded text-gray-400 hover:text-gray-700 shrink-0">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 17h3l9-9-3-3-9 9v3zM11 6l3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </>
                  )}
                  {isBase && <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">{t('page_performance_comparison.baseline')}</span>}
                </div>
                {!isBase && (
                  <button onClick={() => setBaselineId(g.id)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 whitespace-nowrap">
                    {t('page_performance_comparison.set_baseline')}
                  </button>
                )}
                {groups.length > 1 && (
                  <button onClick={() => remove(g.id)} aria-label={t('page_performance_comparison.remove_group')} title={t('page_performance_comparison.remove_group')} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100">
                    <TrashIcon />
                  </button>
                )}
              </div>

              {!g.open && <p className="text-xs text-[var(--text-secondary)] pl-6">{summary(g)}</p>}

              {g.open && (
                <div className="space-y-3 sm:pl-6">
                  <SalesChannelFilter
                    channel={g.channel} onChannelChange={(c) => update(g.id, { channel: c })}
                    locationId={g.locationId} onLocationChange={(v) => update(g.id, { locationId: v, hostId: '' })} locations={locations}
                    hostId={g.hostId} onHostChange={(v) => update(g.id, { hostId: v })} hosts={g.locationId ? hosts.filter((h) => String(h.location_id) === String(g.locationId)) : hosts}
                    affiliateId={g.affiliateId} onAffiliateChange={(v) => update(g.id, { affiliateId: v })} affiliates={affiliates}
                  />
                  <div className="border-t border-[var(--table-divider)] pt-3">
                    <PeriodPicker
                      value={g.range || pageRange} allowAllTime
                      inherited={g.inherited}
                      defaultPreset={g.presetKey === 'inherit' ? '7d' : g.presetKey}
                      onInherit={() => update(g.id, { inherited: true, presetKey: 'inherit' })}
                      onPresetChange={(k) => k !== 'inherit' && update(g.id, { inherited: false, presetKey: k })}
                      onChange={(r) => update(g.id, { inherited: false, range: r })}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <button onClick={add} className="w-full rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 py-2.5 hover:bg-gray-100">
          + {t('page_performance_comparison.add_comparison')}
        </button>
      </div>

      <ComparisonResults rows={rows} />
    </div>
  )
}

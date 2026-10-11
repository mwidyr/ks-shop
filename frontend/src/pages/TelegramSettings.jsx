import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import {
  getTelegramSettings, saveTelegramSettings, checkTelegramConnection,
  sendTelegramTestMessage, sendTelegramTestNotification,
} from '../api/telegram'
import { listHosts } from '../api/hosts'
import { cardClasses } from '../components/Table'
import { jakartaIsoDate } from '../utils/jakartaDate'
import { DEFAULT_TEMPLATES, renderTemplate, templateVars, repeatCount, celebrationEffect } from '../utils/telegramTemplate'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-transparent text-[var(--text-primary)]'
const labelCls = 'block text-xs font-medium text-[var(--text-secondary)] mb-1'

// type -> where it is sent and which fields it has
const TYPES = [
  { key: 'host_milestone', cfgKey: 'host_milestone', dest: 'location', milestones: true, emoji: true, hostTest: true },
  { key: 'personal_best', cfgKey: 'personal_best', dest: 'location', minQty: true, hostTest: true, bestTest: true },
  { key: 'location_milestone', cfgKey: 'location_milestone', dest: 'global', milestones: true, locationTest: true, actualTest: true },
  { key: 'global_host_milestone', cfgKey: 'global_host_milestone', dest: 'global', milestones: true, hostTest: true, actualTest: true },
]

const VARIABLES = [
  ['{host_name}', 'host_name', 'RANI'],
  ['{location_name}', 'location_name', 'Location A'],
  ['{milestone}', 'milestone', '50'],
  ['{qty}', 'qty', '53'],
  ['{previous_best}', 'previous_best', '65'],
  ['{new_best}', 'new_best', '66'],
  ['{date}', 'date', '2026-10-11'],
  ['{celebration_effect}', 'celebration_effect', '🔥🔥🔥🔥🔥'],
]

function Chevron({ open }) {
  return (
    <svg className={`w-4 h-4 shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 7.5l4.5 4.5 4.5-4.5H5.5z" />
    </svg>
  )
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function CopyVar({ text }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable: ignore */ }
    setDone(true)
    setTimeout(() => setDone(false), 1200)
  }
  return (
    <button type="button" onClick={copy} title={t('page_telegram.click_to_copy')} className="font-mono text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-brand-50 whitespace-nowrap">
      {done ? t('page_telegram.copied') : text}
    </button>
  )
}

// One accordion section: Settings on the left, a hideable Preview & Test on the right.
function NotificationSection({ type, cfg, onChange, open, onToggle, locations, hosts, globalChatId, botToken }) {
  const { t } = useTranslation()
  const [showPreview, setShowPreview] = useState(true)
  const [testLoc, setTestLoc] = useState('')
  const [testHost, setTestHost] = useState('')
  const [milestone, setMilestone] = useState(String(cfg.start_milestone ? cfg.start_milestone + (cfg.interval || 0) : 40))
  const [actual, setActual] = useState('')
  const [prevBest, setPrevBest] = useState('65')
  const [newBest, setNewBest] = useState('66')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const hostsOfLoc = useMemo(() => hosts.filter((h) => !testLoc || String(h.location_id) === String(testLoc)), [hosts, testLoc])
  const loc = locations.find((l) => String(l.id) === String(testLoc)) || locations[0]
  const host = hostsOfLoc.find((h) => String(h.id) === String(testHost)) || hostsOfLoc[0]
  const ms = Number(milestone) || 0
  const qty = type.actualTest ? (Number(actual) || ms) : ms
  const date = jakartaIsoDate(new Date())
  const text = renderTemplate(cfg.template, templateVars(type.key, cfg, {
    hostName: host?.name || 'RANI', locationName: loc?.name || 'Location A', milestone: ms, qty: type.hostTest && type.key === 'host_milestone' ? ms : qty,
    previousBest: Number(prevBest) || 0, newBest: Number(newBest) || 0, date,
  }))
  const chatId = type.dest === 'global' ? globalChatId : (loc?.chat_id || '')
  const conditionsMet = type.bestTest
    ? Number(newBest) > Number(prevBest) && Number(newBest) >= (cfg.min_qty || 0)
    : ms >= (cfg.start_milestone || 0) && qty >= ms
  const set = (patch) => onChange({ ...cfg, ...patch })

  async function send() {
    setSending(true); setResult(null)
    try {
      await sendTelegramTestNotification({
        bot_token: botToken, chat_id: chatId, type: type.key, template: cfg.template, emoji: cfg.emoji || '',
        vars: {
          host_name: host?.name || '', location_name: loc?.name || '', milestone: String(ms),
          qty: String(type.key === 'host_milestone' ? ms : qty), previous_best: String(Number(prevBest) || 0), new_best: String(Number(newBest) || 0),
        },
      })
      setResult({ ok: true, msg: t('page_telegram.test_sent') })
    } catch (e) {
      setResult({ ok: false, msg: e.response?.data?.error || t('page_telegram.test_failed') })
    } finally { setSending(false) }
  }

  const title = t(`page_telegram.type_${type.key}`)
  return (
    <div className={`${cardClasses} overflow-hidden ${open ? 'ring-1 ring-brand-600/40' : ''}`}>
      <div className="flex items-center justify-between gap-3 p-4">
        <button type="button" onClick={onToggle} className="flex items-center gap-3 text-left min-w-0 flex-1" aria-expanded={open}>
          <Chevron open={open} />
          <span className="min-w-0">
            <span className="block font-bold text-[var(--text-primary)]">{title}</span>
            <span className="block text-xs text-[var(--text-secondary)]">{t(`page_telegram.type_${type.key}_desc`)}</span>
          </span>
        </button>
        <span className="flex items-center gap-2 shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
          {cfg.enabled ? t('page_telegram.enabled') : t('page_telegram.disabled')}
          <Toggle on={cfg.enabled} onChange={(v) => set({ enabled: v })} label={title} />
        </span>
      </div>

      {open && (
        <div className="border-t border-[var(--table-divider)] p-4 grid gap-6" style={{ gridTemplateColumns: showPreview ? undefined : '1fr' }}>
          <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : ''}`}>
            <div className="space-y-4 min-w-0">
              <h3 className="font-semibold text-[var(--text-primary)]">{t('page_telegram.notification_settings')}</h3>
              {type.milestones && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t('page_telegram.starting_milestone')}</label>
                    <input type="number" min="1" value={cfg.start_milestone} onChange={(e) => set({ start_milestone: Number(e.target.value) })} className={inputCls} />
                    <span className="text-[11px] text-[var(--text-secondary)]">PCS</span>
                  </div>
                  <div>
                    <label className={labelCls}>{t('page_telegram.milestone_interval')}</label>
                    <input type="number" min="1" value={cfg.interval} onChange={(e) => set({ interval: Number(e.target.value) })} className={inputCls} />
                    <span className="text-[11px] text-[var(--text-secondary)]">PCS</span>
                  </div>
                </div>
              )}
              {type.minQty && (
                <div>
                  <label className={labelCls}>{t('page_telegram.minimum_qty')}</label>
                  <input type="number" min="1" value={cfg.min_qty} onChange={(e) => set({ min_qty: Number(e.target.value) })} className={inputCls} />
                  <span className="text-[11px] text-[var(--text-secondary)]">{t('page_telegram.minimum_qty_hint')}</span>
                </div>
              )}
              {type.emoji && (
                <div>
                  <label className={labelCls}>{t('page_telegram.celebration_emoji')}</label>
                  <input value={cfg.emoji} onChange={(e) => set({ emoji: e.target.value })} className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>{t('page_telegram.destination_group')}</label>
                <p className="text-sm text-[var(--text-primary)]">{type.dest === 'global' ? t('page_telegram.dest_global') : t('page_telegram.dest_location')}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">{type.dest === 'global' ? t('page_telegram.dest_global_hint') : t('page_telegram.dest_location_hint')}</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className={labelCls}>{t('page_telegram.message_template')}</label>
                  <button type="button" onClick={() => set({ template: DEFAULT_TEMPLATES[type.key] })} className="text-[11px] text-brand-600 hover:underline">{t('page_telegram.reset_template')}</button>
                </div>
                <textarea rows={6} value={cfg.template} onChange={(e) => set({ template: e.target.value })} className={`${inputCls} font-mono`} />
                <span className="text-[11px] text-[var(--text-secondary)]">{t('page_telegram.template_hint')}</span>
              </div>
            </div>

            {showPreview && (
              <div className="space-y-3 min-w-0 rounded-xl bg-[var(--table-page-bg)] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--text-primary)]">{t('page_telegram.preview_test')}</h3>
                  <button type="button" onClick={() => setShowPreview(false)} className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">{t('page_telegram.hide_preview')}</button>
                </div>
                {(type.hostTest || type.locationTest) && (
                  <div>
                    <label className={labelCls}>{t('page_telegram.test_location')}</label>
                    <select value={testLoc || loc?.id || ''} onChange={(e) => { setTestLoc(e.target.value); setTestHost('') }} className={inputCls}>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                {type.hostTest && (
                  <div>
                    <label className={labelCls}>{t('page_telegram.test_host')}</label>
                    <select value={testHost || host?.id || ''} onChange={(e) => setTestHost(e.target.value)} className={inputCls}>
                      {hostsOfLoc.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>
                )}
                {type.bestTest ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelCls}>{t('page_telegram.previous_best_qty')}</label><input type="number" value={prevBest} onChange={(e) => setPrevBest(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>{t('page_telegram.new_best_qty')}</label><input type="number" value={newBest} onChange={(e) => setNewBest(e.target.value)} className={inputCls} /></div>
                  </div>
                ) : (
                  <div className={`grid gap-3 ${type.actualTest ? 'grid-cols-2' : ''}`}>
                    <div><label className={labelCls}>{t('page_telegram.test_milestone')}</label><input type="number" value={milestone} onChange={(e) => setMilestone(e.target.value)} className={inputCls} /></div>
                    {type.actualTest && (
                      <div><label className={labelCls}>{t('page_telegram.test_actual_qty')}</label><input type="number" placeholder={String(ms)} value={actual} onChange={(e) => setActual(e.target.value)} className={inputCls} /></div>
                    )}
                  </div>
                )}
                <div>
                  <label className={labelCls}>{t('page_telegram.message_preview')}</label>
                  <pre className="whitespace-pre-wrap break-words text-sm rounded-lg bg-[var(--table-card-bg)] border border-[var(--table-divider)] p-3 font-sans text-[var(--text-primary)]">{text}</pre>
                </div>
                {type.key === 'host_milestone' && (
                  <p className="text-xs text-[var(--text-secondary)] flex justify-between">
                    <span>{t('page_telegram.official_repetition')}</span>
                    <span className="font-semibold">{t('page_telegram.n_messages', { count: repeatCount(ms) })}</span>
                  </p>
                )}
                <p className={`text-xs ${conditionsMet ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {conditionsMet ? t('page_telegram.conditions_met') : t('page_telegram.conditions_not_met')}
                </p>
                <button type="button" onClick={send} disabled={sending || !chatId || !botToken.trim()} className="w-full text-sm font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                  {sending ? t('common.loading') : t('page_telegram.send_test')}
                </button>
                {!chatId && <p className="text-xs text-amber-600">{t(type.dest === 'global' ? 'page_telegram.no_global_chat' : 'page_telegram.no_location_chat')}</p>}
                <p className="text-[11px] text-[var(--text-secondary)]">{t(type.dest === 'global' ? 'page_telegram.test_note_global' : 'page_telegram.test_note_location')}</p>
                {result && <p className={`text-xs ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>{result.msg}</p>}
              </div>
            )}
          </div>
          {!showPreview && (
            <div><button type="button" onClick={() => setShowPreview(true)} className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">{t('page_telegram.show_preview')}</button></div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TelegramSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loaded, setLoaded] = useState(false)
  const [token, setToken] = useState('')
  const [tokenSource, setTokenSource] = useState('none')
  const [config, setConfig] = useState(null)
  const [locations, setLocations] = useState([])
  const [hosts, setHosts] = useState([])
  const [openKey, setOpenKey] = useState('host_milestone')
  const [status, setStatus] = useState(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [groupTest, setGroupTest] = useState({})

  useEffect(() => {
    if (user?.role !== 'super_user') return
    getTelegramSettings().then((s) => {
      setToken(s.bot_token || ''); setTokenSource(s.token_source || 'none'); setConfig(s.config); setLocations(s.locations || []); setLoaded(true)
      if (s.token_source && s.token_source !== 'none') checkTelegramConnection('').then(setStatus).catch(() => {})
    }).catch(() => setLoaded(true))
    listHosts(false).then(setHosts)
  }, [user])

  if (user && user.role !== 'super_user') return <Navigate to="/" replace />
  if (!loaded || !config) return <div className="p-12 text-center text-[var(--text-secondary)]">{t('common.loading')}</div>

  const setCfg = (key) => (next) => setConfig((c) => ({ ...c, [key]: next }))
  const setLocChat = (id, chat) => setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, chat_id: chat } : l)))

  async function check() {
    setChecking(true)
    try { setStatus(await checkTelegramConnection(token)) } catch { setStatus({ connected: false, error: 'request failed' }) } finally { setChecking(false) }
  }

  async function testGroup(id, chatId, label) {
    setGroupTest((g) => ({ ...g, [id]: { loading: true } }))
    try {
      await sendTelegramTestMessage({ bot_token: token, chat_id: chatId, label })
      setGroupTest((g) => ({ ...g, [id]: { ok: true } }))
    } catch (e) {
      setGroupTest((g) => ({ ...g, [id]: { ok: false, msg: e.response?.data?.error || t('page_telegram.test_failed') } }))
    }
  }

  async function save() {
    setSaving(true); setToast(null)
    try {
      const s = await saveTelegramSettings({ bot_token: token, config, locations: locations.map((l) => ({ id: l.id, name: l.name, chat_id: l.chat_id })) })
      setConfig(s.config); setLocations(s.locations || []); setTokenSource(s.token_source || 'none')
      setToast({ ok: true, msg: t('page_telegram.saved') })
      check()
    } catch (e) {
      setToast({ ok: false, msg: e.response?.data?.error || t('page_telegram.save_failed') })
    } finally { setSaving(false) }
  }

  const hasToken = !!token || tokenSource === 'environment'
  const statusText = !status ? t('page_telegram.status_unknown')
    : status.connected ? t('page_telegram.status_connected', { bot: status.bot_username ? `@${status.bot_username}` : '' })
    : status.error === 'no_token' ? t('page_telegram.status_no_token') : t('page_telegram.status_failed', { error: status.error })

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4 max-w-6xl">
      <div className={`${cardClasses} p-4 space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">{t('page_telegram.bot_connection')}</h1>
            <p className="text-xs text-[var(--text-secondary)]">{t('page_telegram.bot_connection_desc')}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${status?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{statusText}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--table-divider)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{t('page_telegram.worker_enabled')}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t('page_telegram.worker_enabled_desc')}</p>
            </div>
            <Toggle on={!!config.worker_enabled} onChange={(v) => setConfig((c) => ({ ...c, worker_enabled: v }))} label={t('page_telegram.worker_enabled')} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--table-divider)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{t('page_telegram.send_enabled')}</p>
              <p className="text-xs text-[var(--text-secondary)]">{config.send_enabled ? t('page_telegram.send_on_desc') : t('page_telegram.send_off_desc')}</p>
            </div>
            <Toggle on={!!config.send_enabled} onChange={(v) => setConfig((c) => ({ ...c, send_enabled: v }))} label={t('page_telegram.send_enabled')} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
          <div>
            <label className={labelCls}>{t('page_telegram.bot_token')}</label>
            <div className="flex gap-2">
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenSource === 'environment' ? t('page_telegram.token_from_env_placeholder') : '123456789:AA...'} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} />
              <button type="button" onClick={check} disabled={checking} className="shrink-0 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">
                {checking ? t('common.loading') : t('page_telegram.check_connection')}
              </button>
            </div>
            {tokenSource === 'environment' && !token && <p className="text-xs mt-1 text-[var(--text-secondary)]">{t('page_telegram.token_from_env')}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('page_telegram.global_chat_id')}</label>
            <div className="flex gap-2">
              <input value={config.global_chat_id || ''} onChange={(e) => setConfig((c) => ({ ...c, global_chat_id: e.target.value }))} placeholder="-100..." className={`${inputCls} font-mono`} />
              <button type="button" disabled={!config.global_chat_id || !hasToken || groupTest.global?.loading} onClick={() => testGroup('global', config.global_chat_id, t('page_telegram.global_group'))} className="shrink-0 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50">{t('page_telegram.test_message')}</button>
            </div>
            {groupTest.global && !groupTest.global.loading && <p className={`text-xs mt-1 ${groupTest.global.ok ? 'text-emerald-600' : 'text-red-600'}`}>{groupTest.global.ok ? t('page_telegram.test_sent') : groupTest.global.msg}</p>}
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">{t('page_telegram.global_group_used')}</p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t('page_telegram.location_mapping')}</h2>
          <p className="text-[11px] text-[var(--text-secondary)] mb-2">{t('page_telegram.location_mapping_desc')}</p>
          <div className="space-y-2">
            {locations.map((l) => (
              <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr,2fr,auto] items-center">
                <span className="text-sm font-medium text-[var(--text-primary)]">{l.name}</span>
                <input value={l.chat_id || ''} onChange={(e) => setLocChat(l.id, e.target.value)} placeholder="-100..." className={`${inputCls} font-mono`} />
                <span className="flex items-center gap-2">
                  <button type="button" disabled={!l.chat_id || !hasToken || groupTest[l.id]?.loading} onClick={() => testGroup(l.id, l.chat_id, l.name)} className="text-sm font-semibold px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50">{t('page_telegram.test_message')}</button>
                  {groupTest[l.id] && !groupTest[l.id].loading && <span className={`text-xs ${groupTest[l.id].ok ? 'text-emerald-600' : 'text-red-600'}`}>{groupTest[l.id].ok ? '✓' : groupTest[l.id].msg}</span>}
                </span>
              </div>
            ))}
            {locations.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{t('page_telegram.no_locations')}</p>}
          </div>
        </div>
      </div>

      {TYPES.map((type) => (
        <NotificationSection
          key={type.key} type={type} cfg={config[type.cfgKey]} onChange={setCfg(type.cfgKey)}
          open={openKey === type.key} onToggle={() => setOpenKey((k) => (k === type.key ? null : type.key))}
          locations={locations} hosts={hosts} globalChatId={config.global_chat_id || ''} botToken={token}
        />
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${cardClasses} p-4`}>
          <h2 className="font-bold text-[var(--text-primary)] mb-2">{t('page_telegram.available_variables')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]">
                <th className="py-2 pr-3">{t('page_telegram.col_variable')}</th><th className="py-2 pr-3">{t('page_telegram.col_description')}</th><th className="py-2">{t('page_telegram.col_example')}</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--table-divider)]">
                {VARIABLES.map(([v, key, example]) => (
                  <tr key={v}>
                    <td className="py-2 pr-3"><CopyVar text={v} /></td>
                    <td className="py-2 pr-3 text-[var(--text-secondary)]">{t(`page_telegram.var_${key}`)}</td>
                    <td className="py-2 text-[var(--text-primary)]">{key === 'celebration_effect' ? celebrationEffect('🔥', 50) : example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-2">{t('page_telegram.variables_note')}</p>
        </div>
        <div className={`${cardClasses} p-4`}>
          <h2 className="font-bold text-[var(--text-primary)] mb-1">{t('page_telegram.template_examples')}</h2>
          <p className="text-[11px] text-[var(--text-secondary)] mb-2">{t('page_telegram.examples_note')}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-[var(--text-secondary)] border-b border-[var(--table-divider)]"><th className="py-2 pr-3">{t('page_telegram.col_type')}</th><th className="py-2">{t('page_telegram.col_example_template')}</th></tr></thead>
            <tbody className="divide-y divide-[var(--table-divider)]">
              {TYPES.map((ty) => (
                <tr key={ty.key}>
                  <td className="py-2 pr-3 align-top font-medium text-[var(--text-primary)]">{t(`page_telegram.type_${ty.key}`)}</td>
                  <td className="py-2"><pre className="whitespace-pre-wrap font-mono text-xs text-[var(--text-secondary)]">{DEFAULT_TEMPLATES[ty.key]}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[var(--table-page-bg)]/95 backdrop-blur flex items-center justify-end gap-3 border-t border-[var(--table-divider)]">
        {toast && <span className={`text-sm ${toast.ok ? 'text-emerald-600' : 'text-red-600'}`}>{toast.msg}</span>}
        <button type="button" onClick={save} disabled={saving} className="text-sm font-semibold px-5 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60">
          {saving ? t('common.loading') : t('page_telegram.save_settings')}
        </button>
      </div>
    </div>
  )
}

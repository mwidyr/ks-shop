import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccess } from '../../context/AccessContext'
import { getAnnouncementBar, publishAnnouncementBar, rollbackAnnouncementBar, saveAnnouncementBarDraft } from '../../api/website'
import { IconTrash } from '../icons'
import AnnouncementBarPreview from './AnnouncementBarPreview'
import { btnCls, btnGhost, cardCls, inputCls } from './Pickers'

// Homepage announcement bar (Ralulu Marquee Spec v4, typewriter). Left: the settings in four sections (Content,
// Timing, Appearance, Publishing). Right (sticky): a live phone-width preview. Marketing edits a draft; only an
// Admin (super_user) publishes or rolls back, and every publish is logged.
const LANGS = ['id', 'en', 'zh']
const MAX_MESSAGES = 6
const GUIDE_LEN = 28
const EMOJIS = ['🚚', '🔥', '✨', '🎁', '💖', '🛍️', '⭐', '📣', '🎉', '⏰']
const BACKGROUNDS = [['rose', '#A0344F', '#FFF5F7'], ['ink', '#1A1A1A', '#FFF5F7'], ['blush', '#F9E9EE', '#A0344F'], ['white', '#FFFFFF', '#1A1A1A']]
const TIMING = [['typeMs', 40, 200], ['holdMs', 1200, 6000], ['eraseMs', 20, 120], ['pauseMs', 0, 1000]]
const WIDTHS = [320, 390, 430]
const emptyMessage = () => ({ id: `m${Date.now().toString(36)}`, emoji: '', text: { id: '', en: '', zh: '' }, url: '', enabled: true, from: null, until: null })

function lum(hex) {
  const ch = (i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)
}
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v)
const autoText = (bg) => (BACKGROUNDS.find((b) => b[1].toLowerCase() === bg.toLowerCase())?.[2] || (contrast('#FFFFFF', bg) >= contrast('#1A1A1A', bg) ? '#FFFFFF' : '#1A1A1A'))

export default function AnnouncementBarPanel() {
  const { t, i18n } = useTranslation()
  const { isSuperUser } = useAccess()
  const [cfg, setCfg] = useState(null)
  const [live, setLive] = useState(null)
  const [log, setLog] = useState([])
  const [canRollback, setCanRollback] = useState(false)
  const [auto, setAuto] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [playing, setPlaying] = useState(true)
  const [width, setWidth] = useState(390)
  const [reduced, setReduced] = useState(false)

  const apply = (r) => {
    setCfg(r.draft); setLive(r.published); setLog(r.log || []); setCanRollback(!!r.can_rollback)
    setAuto(r.draft.style.text.toLowerCase() === autoText(r.draft.style.background).toLowerCase())
  }
  useEffect(() => { getAnnouncementBar().then(apply).catch(() => setMsg({ ok: false, text: t('page_website.common.error') })) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const style = (patch) => setCfg((c) => ({ ...c, style: { ...c.style, ...patch } }))
  const setBackground = (bg) => setCfg((c) => ({ ...c, style: { ...c.style, background: bg, ...(auto ? { text: autoText(bg) } : {}) } }))
  const setMsgAt = (i, patch) => setCfg((c) => ({ ...c, messages: c.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)) }))
  const move = (i, d) => setCfg((c) => { const n = [...c.messages]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return { ...c, messages: n } })
  const timing = (k, v) => setCfg((c) => ({ ...c, timing: { ...c.timing, [k]: Number(v) } }))

  const ratio = cfg && isHex(cfg.style.text) && isHex(cfg.style.background) ? contrast(cfg.style.text, cfg.style.background) : 0
  const contrastOk = ratio >= 4.5
  const dirty = useMemo(() => cfg && JSON.stringify(cfg) !== JSON.stringify(live), [cfg, live])
  const previewBar = useMemo(() => {
    if (!cfg) return null
    const pick = (m) => [i18n.language, 'id', 'en', 'zh'].map((l) => (m.text[l] || '').trim()).find(Boolean) || ''
    return { ...cfg, messages: cfg.messages.filter((m) => m.enabled && pick(m)).map((m) => ({ text: `${m.emoji ? `${m.emoji} ` : ''}${pick(m)}`, url: m.url })) }
  }, [cfg, i18n.language])

  async function run(fn, okKey) {
    setBusy(true); setMsg(null)
    try { apply(await fn()); setMsg({ ok: true, text: t(okKey) }) } catch (e) { setMsg({ ok: false, text: e.response?.data?.error || t('page_website.common.error') }) } finally { setBusy(false) }
  }
  const saveDraft = () => run(() => saveAnnouncementBarDraft(cfg), 'page_website.announcements.saved_draft')
  const publish = () => { if (window.confirm(t('page_website.announcements.confirm_publish'))) run(() => publishAnnouncementBar(cfg), 'page_website.announcements.published') }
  const rollback = () => { if (window.confirm(t('page_website.announcements.confirm_rollback'))) run(() => rollbackAnnouncementBar(), 'page_website.announcements.rolled_back') }

  if (!cfg) return null
  const label = 'text-xs text-gray-500'
  const A = (k, o) => t(`page_website.announcements.${k}`, o)
  return (
    <div className={`${cardCls} space-y-4`} data-testid="announcement-bar-panel">
      <div>
        <h2 className="font-bold text-gray-800">{A('title')}</h2>
        <p className="text-xs text-gray-500">{A('intro')}</p>
      </div>
      {msg && <div role="status" className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <section className="space-y-3">
            <h3 className="font-semibold text-gray-800">{A('sec_content')}</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="w-4 h-4" />{A('enabled')}</label>
            <div>
              <label className={label}>{A('preset')}</label>
              <select value={cfg.preset} onChange={(e) => setCfg({ ...cfg, preset: e.target.value })} className={inputCls}><option value="typewriter">{A('preset_typewriter')}</option></select>
            </div>
            {cfg.messages.length === 0 && <p className="text-xs text-amber-700">{A('none')}</p>}
            <div className="divide-y">
              {cfg.messages.map((m, i) => (
                <div key={m.id} className="py-3 space-y-2" data-testid="announcement-row">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-sm">{A('msg_n', { n: i + 1 })}</b>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnGhost} aria-label={t('page_website.common.up')}>▲</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === cfg.messages.length - 1} className={btnGhost} aria-label={t('page_website.common.down')}>▼</button>
                    <label className="flex items-center gap-1 text-sm ml-2"><input type="checkbox" checked={m.enabled} onChange={(e) => setMsgAt(i, { enabled: e.target.checked })} className="w-4 h-4" />{A('active')}</label>
                    <button type="button" onClick={() => setCfg((c) => ({ ...c, messages: c.messages.filter((_, j) => j !== i) }))} className="text-red-600 text-sm flex items-center gap-1 hover:underline ml-auto" aria-label={A('delete')}><IconTrash className="w-4 h-4" />{A('delete')}</button>
                  </div>
                  <div className={`grid sm:grid-cols-3 gap-2 ${m.enabled ? '' : 'opacity-50'}`}>
                    {LANGS.map((l) => {
                      const len = Array.from(m.text[l] || '').length
                      return (
                        <div key={l}>
                          <label className={label}>{A(`lang_${l}`)}</label>
                          <input value={m.text[l] || ''} maxLength={200} onChange={(e) => setMsgAt(i, { text: { ...m.text, [l]: e.target.value } })} className={inputCls} />
                          <div className={`text-xs ${len > GUIDE_LEN ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{len}/{GUIDE_LEN}{len > GUIDE_LEN ? ` · ${A('too_long')}` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={label}>{A('emoji')}</span>
                    <input value={m.emoji} maxLength={8} onChange={(e) => setMsgAt(i, { emoji: e.target.value })} className={`${inputCls} !w-16 text-center`} aria-label={A('emoji')} />
                    {EMOJIS.map((e) => <button key={e} type="button" onClick={() => setMsgAt(i, { emoji: e })} className="px-1.5 py-0.5 rounded hover:bg-gray-100" aria-label={e}>{e}</button>)}
                    {m.emoji && <button type="button" onClick={() => setMsgAt(i, { emoji: '' })} className="text-xs text-gray-500 underline">{A('clear')}</button>}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1"><label className={label}>{A('link')}</label><input value={m.url} onChange={(e) => setMsgAt(i, { url: e.target.value })} placeholder="https://… or /products" className={inputCls} /></div>
                    <div><label className={label}>{A('from')}</label><input type="date" value={m.from || ''} onChange={(e) => setMsgAt(i, { from: e.target.value || null })} className={inputCls} /></div>
                    <div><label className={label}>{A('until')}</label><input type="date" value={m.until || ''} onChange={(e) => setMsgAt(i, { until: e.target.value || null })} className={inputCls} /></div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" disabled={cfg.messages.length >= MAX_MESSAGES} onClick={() => setCfg((c) => ({ ...c, messages: [...c.messages, emptyMessage()] }))} className={btnGhost}>+ {A('add_message')}</button>
            {cfg.messages.length >= MAX_MESSAGES && <span className="text-xs text-gray-500 ml-2">{A('max_messages', { n: MAX_MESSAGES })}</span>}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-gray-800">{A('sec_timing')}</h3>
            {TIMING.map(([k, lo, hi]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="text-sm w-44 shrink-0" htmlFor={`bar-${k}`}>{A(`t_${k}`)}</label>
                <input type="range" min={lo} max={hi} step={k === 'typeMs' || k === 'eraseMs' ? 5 : 50} value={cfg.timing[k]} onChange={(e) => timing(k, e.target.value)} className="flex-1" aria-label={A(`t_${k}`)} />
                <input id={`bar-${k}`} type="number" min={lo} max={hi} value={cfg.timing[k]} onChange={(e) => timing(k, e.target.value)} className={`${inputCls} !w-24`} />
              </div>
            ))}
            <p className="text-xs text-gray-500">{A('cps', { n: (1000 / (cfg.timing.typeMs || 90)).toFixed(1) })}</p>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-gray-800">{A('sec_appearance')}</h3>
            <div>
              <label className={label}>{A('bg')}</label>
              <div className="flex gap-2 flex-wrap">
                {BACKGROUNDS.map(([key, hex]) => (
                  <button key={key} type="button" onClick={() => setBackground(hex)} aria-pressed={cfg.style.background.toLowerCase() === hex.toLowerCase()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 ${cfg.style.background.toLowerCase() === hex.toLowerCase() ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-300'}`}>
                    <span className="w-4 h-4 rounded border border-gray-300" style={{ background: hex }} />{A(`bg_${key}`)} {hex}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className={label}>{A('text_color')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={cfg.style.text} disabled={auto} onChange={(e) => style({ text: e.target.value })} className="h-9 w-12" aria-label={A('text_color')} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) style({ text: autoText(cfg.style.background) }) }} className="w-4 h-4" />{A('text_auto')}</label>
                </div>
              </div>
              {cfg.style.showPrompt && (
                <div>
                  <label className={label}>{A('accent')}</label>
                  <input type="color" value={cfg.style.accent} onChange={(e) => style({ accent: e.target.value })} className="h-9 w-12" aria-label={A('accent')} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.style.showPrompt} onChange={(e) => style({ showPrompt: e.target.checked })} className="w-4 h-4" />{A('show_prompt')}</label>
            </div>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">{A('font_size')}</span>
                <button type="button" className={btnGhost} disabled={cfg.style.fontSize <= 14} onClick={() => style({ fontSize: cfg.style.fontSize - 1 })} aria-label="−">−</button>
                <b className="w-12 text-center text-sm">{cfg.style.fontSize}px</b>
                <button type="button" className={btnGhost} disabled={cfg.style.fontSize >= 18} onClick={() => style({ fontSize: cfg.style.fontSize + 1 })} aria-label="+">+</button>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <label className="text-sm" htmlFor="bar-radius">{A('radius')}</label>
                <input id="bar-radius" type="range" min={0} max={16} value={cfg.style.radius} onChange={(e) => style({ radius: Number(e.target.value) })} className="flex-1" />
                <b className="w-10 text-sm">{cfg.style.radius}px</b>
              </div>
            </div>
            {contrastOk
              ? <p className="text-xs text-green-700">{A('contrast_ok', { r: ratio.toFixed(1) })}</p>
              : <p role="alert" className="text-xs inline-block bg-red-600 text-white font-semibold px-2 py-1 rounded">{A('contrast_bad', { r: ratio.toFixed(1) })}</p>}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-gray-800">{A('sec_publishing')}</h3>
            {dirty && <p className="text-xs text-amber-700">{A('unpublished')}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveDraft} disabled={busy} className={btnGhost}>{A('save_draft')}</button>
              <button type="button" onClick={publish} disabled={busy || !isSuperUser || !contrastOk || (cfg.enabled && cfg.messages.length === 0)} className={btnCls}>{A('publish')}</button>
              <button type="button" onClick={rollback} disabled={busy || !isSuperUser || !canRollback} className={btnGhost}>{A('rollback')}</button>
            </div>
            {!isSuperUser && <p className="text-xs text-gray-500">{A('admin_only')}</p>}
            <div>
              <h4 className="text-sm font-semibold text-gray-700">{A('log_title')}</h4>
              {log.length === 0 && <p className="text-xs text-gray-400">{A('log_none')}</p>}
              <ul className="text-xs text-gray-600 space-y-1 mt-1">
                {log.map((l, k) => <li key={k}><b>{l.action}</b> · {l.editor} · {new Date(l.created_at).toLocaleString()} · {l.summary}</li>)}
              </ul>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 space-y-2" aria-label={A('preview_title')}>
          <h3 className="font-semibold text-gray-800">{A('preview_title')}</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => setPlaying((p) => !p)} className={btnGhost}>{playing ? A('pause') : A('play')}</button>
            {WIDTHS.map((w) => <button key={w} type="button" onClick={() => setWidth(w)} aria-pressed={width === w} className={`${btnGhost} ${width === w ? '!border-brand-600 !text-brand-700' : ''}`}>{w}</button>)}
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} className="w-4 h-4" />{A('reduced_preview')}</label>
          </div>
          <div className="overflow-x-auto">
            <div className="mx-auto rounded-[28px] border-4 border-gray-800 bg-white p-4" style={{ width: width + 32 }}>
              {cfg.enabled && previewBar?.messages.length > 0 ? <AnnouncementBarPreview bar={previewBar} reducedMotion={reduced} forcePause={!playing} /> : <p className="text-xs text-gray-400 text-center py-3">{cfg.enabled ? A('none') : A('hidden')}</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createThemePreview, getThemeDraft, listThemePresets, listThemeVersions, publishTheme, restoreThemeVersion, saveThemeDraft } from '../api/website'
import { btnCls, btnGhost, cardCls } from '../components/website/Pickers'
import LogoCard from '../components/website/LogoCard'
import { resolveUrl } from '../utils/image'

const ROLES = ['primary', 'onPrimary', 'primaryHover', 'primaryStrong', 'primarySoft', 'secondary', 'bg', 'bgSoft', 'surface', 'text', 'text2', 'text3', 'disabled', 'border', 'borderStrong', 'success', 'warning', 'error', 'info', 'live']
const CSS = { primary: 'primary', onPrimary: 'on-primary', primaryHover: 'primary-hover', primaryStrong: 'primary-strong', primarySoft: 'primary-soft', secondary: 'secondary', bg: 'bg', bgSoft: 'bg-soft', surface: 'surface', text: 'text', text2: 'text-2', text3: 'text-3', disabled: 'disabled', border: 'border', borderStrong: 'border-strong', success: 'success', warning: 'warning', error: 'error', info: 'info', live: 'live' }

// WCAG contrast, same maths as the backend validator (which re-checks before publishing).
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
export function ratio(a, b) {
  const la = lum(a); const lb = lum(b)
  if (la == null || lb == null) return 0
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
const r1 = (x) => Math.round(x * 10) / 10

// which pairs involve each role (for the inline "contrast" badge) -> [against token or hex, min]
function checksFor(role, tk) {
  switch (role) {
    case 'text': case 'text2': case 'text3': return [['bg', 4.5], ['surface', 4.5], ['bgSoft', 4.5]].map(([k, m]) => [tk[k], m, k])
    case 'onPrimary': return [[tk.primary, 4.5, 'primary']]
    case 'primary': return [[tk.onPrimary, 4.5, 'onPrimary']]
    case 'primaryStrong': return [[tk.surface, 4.5, 'surface']]
    case 'borderStrong': return [[tk.surface, 3, 'surface']]
    case 'success': case 'warning': case 'error': case 'info': case 'live': return [[tk.surface, 4.5, 'surface'], ['#FFFFFF', 4.5, 'white']]
    default: return []
  }
}

function Preview({ tokens, mode, logo }) {
  const t = tokens
  const bg = mode === 'soft' ? t.bgSoft : t.bg
  const vars = Object.fromEntries(Object.entries(CSS).map(([k, v]) => [`--color-${v}`, k === 'bg' ? bg : t[k]]))
  return (
    <div style={{ ...vars, background: 'var(--color-bg)', color: 'var(--color-text)', borderRadius: 18, padding: 14, border: '1px solid var(--color-border)', fontFamily: "'Noto Sans TC', sans-serif" }} className="text-sm">
      <div className="flex items-center gap-2 mb-3">
        {logo
          ? <img src={resolveUrl(logo)} alt="logo" style={{ height: 28, maxWidth: 160, objectFit: 'contain' }} />
          : <b className="text-2xl italic" style={{ color: 'var(--color-primary-strong)', fontFamily: 'serif' }}>ralulu</b>}
        <span style={{ background: 'var(--color-live)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontWeight: 900, fontSize: 11 }}>● LIVE</span>
      </div>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 12 }} className="mb-3">
        <div style={{ color: 'var(--color-text-2)', fontSize: 12 }}>Harga live</div>
        <b>Kemeja kotak longgar</b>
        <div><b style={{ fontSize: 18 }}>NT$590</b> <s style={{ color: 'var(--color-text-3)' }}>NT$890</s> <b style={{ color: 'var(--color-live)' }}>-34%</b></div>
        <div style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 12 }}>✓ Gratis ongkir min. NT$1,500</div>
        <div className="flex gap-2 mt-2">
          <span style={{ border: '2px solid var(--color-text)', borderRadius: 8, padding: '4px 12px' }}>M</span>
          <span style={{ border: '2px solid var(--color-primary-strong)', background: 'var(--color-primary-soft)', color: 'var(--color-primary-strong)', borderRadius: 8, padding: '4px 12px', fontWeight: 700 }}>L</span>
        </div>
      </div>
      <button type="button" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', borderRadius: 24, padding: '10px 18px', fontWeight: 700, width: '100%' }}>Tambah ke keranjang</button>
      <div className="flex gap-2 mt-3 text-xs">
        <span style={{ background: 'var(--color-error-bg, #fdecec)', color: 'var(--color-error)', padding: '4px 8px', borderRadius: 8 }}>✕ Format telepon salah</span>
        <span style={{ background: 'var(--color-bg-soft)', color: 'var(--color-warning)', padding: '4px 8px', borderRadius: 8 }}>! Sistem sibuk</span>
        <span style={{ background: 'var(--color-bg-soft)', color: 'var(--color-info)', padding: '4px 8px', borderRadius: 8 }}>i Info</span>
      </div>
      <div style={{ marginTop: 10, border: '1.5px dashed var(--color-secondary)', background: 'var(--color-primary-soft)', borderRadius: 12, padding: 8, fontSize: 12, fontWeight: 900 }}>Tonton live dapat kupon NT$100</div>
    </div>
  )
}

export default function ThemeCenter() {
  const { t } = useTranslation()
  const th = (k, o) => t(`page_website.theme.${k}`, o)
  const [draft, setDraft] = useState(null)
  const [pub, setPub] = useState(null)
  const [presets, setPresets] = useState([])
  const [versions, setVersions] = useState([])
  const [msg, setMsg] = useState(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState('')
  const [logo, setLogo] = useState('')

  const load = useCallback(async () => {
    const [d, p, v] = await Promise.all([getThemeDraft(), listThemePresets(), listThemeVersions()])
    setDraft({ name: d.draft.name, preset_key: d.draft.preset_key, tokens: d.draft.tokens, mode: d.draft.mode })
    setPub(d.published); setPresets(p); setVersions(v)
  }, [])
  useEffect(() => { load().catch(() => setMsg({ ok: false, text: t('page_website.common.error') })) }, [load, t])

  const issues = useMemo(() => {
    if (!draft) return []
    const out = []
    ROLES.forEach((role) => checksFor(role, draft.tokens).forEach(([against, min, label]) => {
      const rr = r1(ratio(draft.tokens[role], against))
      if (rr < min) out.push({ role, label, ratio: rr, min })
    }))
    return out
  }, [draft])

  if (!draft) return <div className="p-6 text-gray-500">{t('page_website.common.loading')}</div>
  const setToken = (role, value) => setDraft((cur) => ({ ...cur, preset_key: null, tokens: { ...cur.tokens, [role]: value } }))
  const dark = '#2B2B2E'
  const bestOn = ratio('#FFFFFF', draft.tokens.primary) > ratio(dark, draft.tokens.primary) ? '#FFFFFF' : dark

  async function act(name, fn) {
    setBusy(name); setMsg(null)
    try { await fn() } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || th('publish_failed') })
    } finally { setBusy('') }
  }
  const saveDraft = () => act('save', async () => { await saveThemeDraft(draft); setMsg({ ok: true, text: th('draft_saved') }); load() })
  const makeLink = () => act('link', async () => { await saveThemeDraft(draft); const r = await createThemePreview(); setLink(`${import.meta.env.VITE_STORE_URL || ''}${r.path}`) })
  const publish = () => act('publish', async () => { await saveThemeDraft(draft); await publishTheme(); setMsg({ ok: true, text: th('published') }); load() })

  return (
    <div className="px-4 sm:px-6 py-6 grid xl:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{th('title')}</h1>
          <p className="text-sm text-gray-500">{th('intro')}</p>
          <p className="text-xs text-gray-500 mt-1">{th('live_version', { name: pub?.name })}</p>
        </div>
        {msg && <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
        {link && <div className="text-sm bg-blue-50 text-blue-800 px-4 py-2 rounded-lg break-all">{th('link_made')}: <a href={link} target="_blank" rel="noreferrer" className="underline">{link}</a></div>}

        <LogoCard onChange={setLogo} />

        <div className={`${cardCls} space-y-3`}>
          <h2 className="font-bold text-gray-800">{th('presets')}</h2>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p.key} type="button" onClick={() => setDraft((cur) => ({ ...cur, name: p.name, preset_key: p.key, tokens: p.tokens }))}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${draft.preset_key === p.key ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-gray-300'}`}>
                <span className="w-5 h-5 rounded-full" style={{ background: p.tokens.primary }} /><span className="w-5 h-5 rounded-full border" style={{ background: p.tokens.bg }} />{p.name}
              </button>
            ))}
          </div>
          <h2 className="font-bold text-gray-800 pt-2">{th('mode')}</h2>
          <div className="flex gap-4 text-sm">
            {['light', 'soft'].map((m) => <label key={m} className="flex items-center gap-2"><input type="radio" name="mode" checked={draft.mode === m} onChange={() => setDraft((cur) => ({ ...cur, mode: m }))} />{th(`mode_${m}`)}</label>)}
          </div>
        </div>

        {issues.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
            <b className="text-red-700">✕ {th('blocked', { n: issues.length })}</b>
            {issues.some((i) => i.role === 'onPrimary' || i.role === 'primary') && (
              <div className="text-sm flex items-center gap-2 flex-wrap">
                {th('suggest', { text: `${bestOn} → ${r1(ratio(bestOn, draft.tokens.primary))}:1` })}
                <button type="button" onClick={() => setToken('onPrimary', bestOn)} className={btnGhost}>{th('apply')}</button>
              </div>
            )}
            <ul className="text-xs text-red-800 list-disc pl-5">
              {issues.map((i) => <li key={`${i.role}-${i.label}`}>{th(`roles_desc.${i.role}`)} / {i.label}: {i.ratio}:1 ({th('needs', { min: i.min })})</li>)}
            </ul>
          </div>
        )}

        <div className={`${cardCls} space-y-2`}>
          <h2 className="font-bold text-gray-800">{th('roles')}</h2>
          {ROLES.map((role) => {
            const checks = checksFor(role, draft.tokens)
            return (
              <div key={role} className="flex items-center gap-3 flex-wrap py-1.5 border-b border-gray-100 last:border-0">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.tokens[role]) ? draft.tokens[role] : '#000000'} onChange={(e) => setToken(role, e.target.value.toUpperCase())} className="w-10 h-10 rounded cursor-pointer" aria-label={role} />
                <input value={draft.tokens[role]} onChange={(e) => setToken(role, e.target.value.toUpperCase())} className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                <div className="flex-1 min-w-[180px]"><div className="text-sm font-medium">{th(`roles_desc.${role}`)}</div><div className="text-[11px] text-gray-400">--color-{CSS[role]}</div></div>
                <div className="flex gap-1 flex-wrap">
                  {checks.map(([against, min, label]) => {
                    const rr = r1(ratio(draft.tokens[role], against))
                    const ok = rr >= min
                    return <span key={label} className={`text-[11px] px-2 py-0.5 rounded ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{ok ? '✓' : '✕'} {label} {rr}:1</span>
                  })}
                </div>
                <button type="button" onClick={() => pub && setToken(role, pub.tokens[role])} className={btnGhost}>{th('reset')}</button>
              </div>
            )
          })}
        </div>

        <div className={`${cardCls} space-y-3`}>
          <h2 className="font-bold text-gray-800">{th('versions')}</h2>
          <ul className="divide-y text-sm">
            {versions.map((v) => (
              <li key={v.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-gray-400">v{v.id}</span>
                <span className="flex-1 min-w-[160px]">{v.name}{v.created_by ? <span className="text-gray-400"> · {th('by', { name: v.created_by })}</span> : null}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${v.status === 'published' ? 'bg-green-100 text-green-700' : v.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{th(`v_${v.status}`)}</span>
                {v.status !== 'draft' && <button type="button" onClick={() => act('restore', async () => { await restoreThemeVersion(v.id); await load() })} className={btnGhost}>{th('restore')}</button>}
              </li>
            ))}
          </ul>
        </div>

        <div className="sticky bottom-0 bg-gray-50/90 py-3 flex gap-3 flex-wrap">
          <button type="button" onClick={saveDraft} disabled={Boolean(busy)} className="border border-gray-300 bg-white font-semibold px-5 py-2 rounded-lg text-sm">{th('save_draft')}</button>
          <button type="button" onClick={makeLink} disabled={Boolean(busy)} className="border border-gray-300 bg-white font-semibold px-5 py-2 rounded-lg text-sm">{th('preview_link')}</button>
          <button type="button" onClick={publish} disabled={Boolean(busy) || issues.length > 0} className={btnCls}>{th('publish')}</button>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 space-y-2">
        <h2 className="font-bold text-gray-800">{th('preview')}</h2>
        <Preview tokens={draft.tokens} mode={draft.mode} logo={logo} />
      </div>
    </div>
  )
}

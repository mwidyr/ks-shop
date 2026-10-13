import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getContentList, img, onImgError, sized } from '../lib/api'
import { useSeo } from '../lib/seo'
import { IconSearch } from '../components/Icons'
import { EmptyState, ErrorState, iconBtn, PageHeader, Skeleton } from '../components/ui'

// Style journal: topics + articles (SEO pages under /style/...), filter by label.
export default function Style() {
  const { t, i18n } = useTranslation()
  const { desktop } = useOutletContext()
  const [sp, setSp] = useSearchParams()
  const label = sp.get('label') || ''
  const [d, setD] = useState(null)
  const [error, setError] = useState(false)
  useSeo({ title: t('style.title'), description: t('style.title'), canonical: '/style' })
  const load = useCallback(() => { setError(false); getContentList({ label, limit: 40 }).then(setD).catch(() => setError(true)) }, [label])
  useEffect(() => { load() }, [load, i18n.language])
  const px = desktop ? 40 : 16
  const items = d?.items || []
  const [hero, ...rest] = items
  const href = (c) => (c.type === 'host_article' ? `/hosts/${c.author_slug}/journal/${c.slug}` : `/style/${c.slug}`)
  const pill = (on) => ({ flex: 'none', height: 34, padding: '0 14px', borderRadius: 17, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'content-box', ...(on ? { background: 'var(--color-text)', color: '#FFFFFF', fontWeight: 700, border: 'none' } : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }) })
  return (
    <div style={{ paddingBottom: 130 }}>
      <PageHeader title={t('style.title')} to="/" right={<Link to="/search" aria-label={t('common.search')} style={iconBtn}><IconSearch size={20} /></Link>} />
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: `12px ${px}px` }}>
        <button type="button" onClick={() => setSp({}, { replace: true })} style={pill(!label)}>{t('style.all')}</button>
        {(d?.labels || []).map((l) => <button key={l} type="button" onClick={() => setSp({ label: l }, { replace: true })} style={pill(label === l)}>{l}</button>)}
      </div>
      {error && <ErrorState title={t('style.error')} onRetry={load} />}
      {!d && !error && <div style={{ padding: px }}><Skeleton h={200} r={18} /></div>}
      {d && items.length === 0 && <EmptyState title={t('style.empty')} />}
      {hero && (
        <Link to={href(hero)} style={{ display: 'block', position: 'relative', margin: `0 ${px}px`, height: desktop ? 340 : 420, borderRadius: 20, overflow: 'hidden', textDecoration: 'none', color: '#FFFFFF', background: 'var(--color-primary-soft)' }}>
          <img src={sized(img(hero.cover_url), 900)} alt={hero.cover_alt || hero.title} fetchpriority="high" onError={onImgError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, background: 'rgba(30,30,35,0.72)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: 'var(--color-secondary)' }}>{hero.category_label}{hero.is_featured ? `・${t('style.featured')}` : ''}</span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>{hero.title}</h2>
            <span style={{ fontSize: 13 }}>{hero.summary}</span>
          </span>
        </Link>
      )}
      {rest.length > 0 && (
        <section style={{ padding: `24px ${px}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--color-secondary)', fontWeight: 700 }}>LATEST</span><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t('style.latest')}</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 4 : 2}, minmax(0, 1fr))`, gap: '20px 12px', marginTop: 14 }}>
            {rest.map((c) => (
              <Link key={c.id} to={href(c)} style={{ display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', color: 'var(--color-text)' }}>
                <img src={sized(img(c.cover_url), 480)} alt={c.cover_alt || c.title} loading="lazy" onError={onImgError} style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: 14, objectFit: 'cover', objectPosition: 'center 25%', background: 'var(--color-bg-soft)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--color-secondary)' }}>{c.category_label}</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>{c.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div style={{ height: 120 }} />
    </div>
  )
}

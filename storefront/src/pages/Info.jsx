import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/seo'
import { COMPANY_TAX_ID } from '../lib/company'
import { EmptyState, PageHeader } from '../components/ui'

// about / shipping / terms / privacy carry structured legal text (i18n/parts/legal.js); returns keeps its short body.
const LEGAL = ['about', 'shipping', 'terms', 'privacy']
const KEYS = [...LEGAL, 'returns']

function Legal({ slug }) {
  const { t } = useTranslation()
  const page = t(`legal.${slug}`, { returnObjects: true, taxId: COMPANY_TAX_ID })
  const p = { margin: '0 0 10px', fontSize: 15, lineHeight: 1.9, color: 'var(--color-text-2)' }
  return (
    <div style={{ padding: 16 }}>
      {page.intro && <p style={p}>{page.intro}</p>}
      {page.sections.map((s) => (
        <section key={s.h} style={{ marginTop: 18 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{s.h}</h2>
          {s.b.map((b, i) => (Array.isArray(b)
            ? <ul key={i} style={{ ...p, paddingLeft: 22 }}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
            : <p key={i} style={p}>{b}</p>))}
        </section>
      ))}
    </div>
  )
}

export default function Info() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const ok = KEYS.includes(slug)
  const legal = LEGAL.includes(slug)
  const title = !ok ? '' : legal ? t(`legal.${slug}.title`) : t('footer.returns')
  useSeo({ title, description: !ok ? '' : legal ? t(`legal.${slug}.intro`, { defaultValue: t(`legal.${slug}.sections.0.b.0`) }) : t('info.returns_body'), canonical: `/info/${slug}` })
  if (!ok) return <div><PageHeader title="" /><EmptyState title="404" /></div>
  if (legal) return <div><PageHeader title={title} /><Legal slug={slug} /></div>
  return (
    <div>
      <PageHeader title={title} />
      <div style={{ padding: 16, fontSize: 15, lineHeight: 1.9, color: 'var(--color-text-2)' }}>{t('info.returns_body')}</div>
    </div>
  )
}

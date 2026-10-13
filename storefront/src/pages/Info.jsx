import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/seo'
import { EmptyState, PageHeader } from '../components/ui'

const KEYS = ['about', 'returns', 'shipping', 'terms']

export default function Info() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const ok = KEYS.includes(slug)
  useSeo({ title: ok ? t(`info.${slug}`) : '', description: ok ? t(`info.${slug}_body`) : '', canonical: `/info/${slug}` })
  if (!ok) return <div><PageHeader title="" /><EmptyState title="404" /></div>
  return (
    <div>
      <PageHeader title={t(`info.${slug}`)} />
      <div style={{ padding: 16, fontSize: 15, lineHeight: 1.9, color: 'var(--color-text-2)' }}>{t(`info.${slug}_body`)}</div>
    </div>
  )
}

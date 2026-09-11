import { useTranslation } from 'react-i18next'

const colors = {
  draft: 'bg-gray-100 text-gray-500',
  live: 'bg-green-100 text-green-700',
  ended: 'bg-blue-50 text-blue-600',
}

export default function SessionStatusPill({ status }) {
  const { t } = useTranslation()
  const labels = { draft: t('shared.session_draft'), live: t('shared.session_live'), ended: t('shared.session_ended') }
  return (
    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${colors[status] || colors.draft}`}>
      {labels[status] || status}
    </span>
  )
}

import { useTranslation } from 'react-i18next'

// Notes written on the source Purchase Requisition's supplier section, shown read-only on the
// Purchase Order (they are edited on the requisition itself).
export default function PRNotes({ notes, compact = false }) {
  const { t } = useTranslation()
  if (!notes?.length) return null
  return (
    <div className={compact ? 'text-sm' : 'mt-3 text-sm'}>
      <p className="text-[11px] text-gray-400 uppercase">{t('page_purchases.pr_notes_label')}</p>
      <ul className="mt-1 space-y-1.5">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5">
            <p className="text-gray-700 whitespace-pre-line">{n.note}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {n.created_by_name} · {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

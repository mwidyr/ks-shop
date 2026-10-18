import { useTabLevel } from '../context/AccessContext'

// Locks a page for a view-only role: every field and button inside is disabled (links still work),
// so nothing can be changed or submitted. Edit roles see the page untouched. The server refuses
// writes from view-only roles as well (RequireTabEdit); this is the part the user sees.
export default function EditLock({ children }) {
  const level = useTabLevel()
  if (level !== 'view') return children
  return <fieldset disabled data-readonly="true" className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
}

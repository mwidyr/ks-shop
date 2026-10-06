import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { verifyPassword } from '../api/auth'
import PasswordInput from './PasswordInput'

// Re-verifies the logged-in user's own password as a confirmation step before an irreversible
// admin-only action (item 074: Super Admin hard-deleting a product with order history). Calls
// onConfirm() only after the password actually checks out against /auth/verify-password.
export default function PasswordConfirmModal({ title, message, onConfirm, onClose }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await verifyPassword(password)
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('shared.password_confirm_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleConfirm} className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800 mb-1">{title}</h2>
        {message && <p className="text-sm text-gray-500 mb-4">{message}</p>}
        <label className="block text-[11px] text-gray-500 mb-1">{t('shared.password_confirm_label')}</label>
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 px-3 py-2 hover:underline">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy || !password} className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            {busy ? t('shared.password_confirm_busy') : t('shared.password_confirm_button')}
          </button>
        </div>
      </form>
    </div>
  )
}

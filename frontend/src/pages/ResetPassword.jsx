import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resetPassword, validateAuthToken } from '../api/auth'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setChecking(false); return }
    validateAuthToken(token)
      .then((res) => setValid(res.valid && res.purpose === 'reset'))
      .catch(() => setValid(false))
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('page_reset_password.mismatch_error'))
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || t('page_reset_password.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden p-8 sm:p-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('page_reset_password.heading')}</h2>

        {checking ? (
          <p className="text-sm text-gray-500 mt-4">{t('page_login.processing')}</p>
        ) : !valid ? (
          <>
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
              {t('page_reset_password.invalid_link')}
            </p>
            <Link to="/forgot-password" className="block mt-6 text-sm text-brand-600 hover:text-brand-700 text-center">
              {t('page_forgot_password.heading')}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">{t('page_reset_password.subheading')}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_reset_password.new_password_label')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_reset_password.confirm_password_label')}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
              >
                {loading ? t('page_login.processing') : t('page_reset_password.submit_button')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

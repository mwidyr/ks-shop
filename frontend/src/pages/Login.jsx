import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const sampleAccounts = [
  { roleKey: 'super_user', email: 'superuser@demo.com' },
  { roleKey: 'management', email: 'management@demo.com' },
  { roleKey: 'spv', email: 'spv@demo.com' },
  { roleKey: 'sales', email: 'sales1@demo.com' },
]

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || t('page_login.login_failed_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="hidden md:flex flex-col justify-center p-10 bg-brand-600 text-white">
          <div className="w-12 h-12 rounded-xl bg-white text-brand-600 flex items-center justify-center font-extrabold text-2xl mb-6">K</div>
          <h1 className="text-3xl font-extrabold mb-3">{t('brand.name')}</h1>
          <p className="text-brand-100 text-sm leading-relaxed">
            {t('page_login.tagline')}
          </p>
          <div className="mt-10 text-xs text-brand-100 space-y-1">
            <p className="font-semibold text-white mb-1">{t('page_login.sample_accounts_label')}</p>
            {sampleAccounts.map((a) => (
              <p key={a.email}>{t(`page_login.role_${a.roleKey}`)}: <span className="font-mono">{a.email}</span></p>
            ))}
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('page_login.login_heading')}</h2>
          <p className="text-sm text-gray-500 mb-6">{t('page_login.login_subheading')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_login.email_label')}</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('page_login.email_placeholder')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">{t('page_login.password_label')}</label>
                <Link to="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700">
                  {t('page_login.forgot_password_link')}
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? t('page_login.processing') : t('page_login.login_heading')}
            </button>
            <button
              type="button"
              disabled
              title={t('page_login.google_signin_soon')}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-400 font-semibold py-2.5 rounded-lg cursor-not-allowed opacity-60"
            >
              {t('page_login.google_signin_button')}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {sampleAccounts.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => { setEmail(a.email); setPassword('password123') }}
                className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                {t(`page_login.role_${a.roleKey}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

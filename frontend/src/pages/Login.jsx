import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { requestLoginOtp, verifyLoginOtp } from '../api/auth'

const sampleAccounts = [
  { roleKey: 'super_user', email: 'superuser@demo.com' },
  { roleKey: 'management', email: 'management@demo.com' },
  { roleKey: 'spv', email: 'spv@demo.com' },
  { roleKey: 'sales', email: 'sales1@demo.com' },
]

const OTP_RESEND_COOLDOWN = 30

function OtpLoginForm({ onBackToPassword }) {
  const { t } = useTranslation()
  const { applySession } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleSendCode(e) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      await requestLoginOtp(email)
      setStep('code')
      setCode('')
      setCooldown(OTP_RESEND_COOLDOWN)
    } catch (err) {
      setError(err.response?.data?.error || t('page_login.otp_error_generic'))
    } finally {
      setSending(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || sending) return
    setError('')
    setSending(true)
    try {
      await requestLoginOtp(email)
      setCooldown(OTP_RESEND_COOLDOWN)
    } catch (err) {
      setError(err.response?.data?.error || t('page_login.otp_error_generic'))
    } finally {
      setSending(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setVerifying(true)
    try {
      const res = await verifyLoginOtp(email, code)
      applySession(res.token, res.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || t('page_login.otp_error_invalid_code'))
    } finally {
      setVerifying(false)
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={handleSendCode} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('page_login.email_label')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('page_login.email_placeholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1">{t('page_login.otp_email_hint')}</p>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
        >
          {sending ? t('page_login.processing') : t('page_login.otp_send_button')}
        </button>
        <button type="button" onClick={onBackToPassword} className="w-full text-sm text-brand-600 hover:text-brand-700 text-center">
          {t('page_login.otp_back_to_password')}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        {t('page_login.otp_sent_message', { email })}
      </p>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">{t('page_login.otp_code_label')}</label>
          <button type="button" onClick={() => { setStep('email'); setError('') }} className="text-xs text-brand-600 hover:text-brand-700">
            {t('page_login.otp_change_email')}
          </button>
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={t('page_login.otp_code_placeholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 tracking-[0.3em] text-center font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          required
          autoFocus
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={verifying || code.length !== 6}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
      >
        {verifying ? t('page_login.processing') : t('page_login.otp_verify_button')}
      </button>
      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0 || sending}
        className="w-full text-sm text-gray-500 hover:text-gray-700 text-center disabled:opacity-50"
      >
        {cooldown > 0 ? t('page_login.otp_resend_wait', { seconds: cooldown }) : t('page_login.otp_resend_button')}
      </button>
    </form>
  )
}

export default function Login() {
  const { t } = useTranslation()
  const [mode, setMode] = useState('password') // 'password' | 'otp'
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
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'password' ? t('page_login.login_subheading') : t('page_login.otp_subheading')}
          </p>

          {mode === 'password' ? (
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
                onClick={() => { setMode('otp'); setError('') }}
                className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-lg transition"
              >
                {t('page_login.otp_switch_button')}
              </button>
            </form>
          ) : (
            <OtpLoginForm onBackToPassword={() => { setMode('password'); setError('') }} />
          )}

          {mode === 'password' && (
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
          )}
        </div>
      </div>
    </div>
  )
}

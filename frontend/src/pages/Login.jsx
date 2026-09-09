import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const sampleAccounts = [
  { role: 'Super User', email: 'superuser@demo.com' },
  { role: 'Management', email: 'management@demo.com' },
  { role: 'SPV', email: 'spv@demo.com' },
  { role: 'Sales', email: 'sales1@demo.com' },
]

export default function Login() {
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
      setError(err.response?.data?.error || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="hidden md:flex flex-col justify-center p-10 bg-brand-600 text-white">
          <div className="w-12 h-12 rounded-xl bg-white text-brand-600 flex items-center justify-center font-extrabold text-2xl mb-6">K</div>
          <h1 className="text-3xl font-extrabold mb-3">KS Shop</h1>
          <p className="text-brand-100 text-sm leading-relaxed">
            Seller & Shop Management. Kelola host live, produk, stok, dan order dalam satu tempat.
          </p>
          <div className="mt-10 text-xs text-brand-100 space-y-1">
            <p className="font-semibold text-white mb-1">Sample akun (password: password123)</p>
            {sampleAccounts.map((a) => (
              <p key={a.email}>{a.role}: <span className="font-mono">{a.email}</span></p>
            ))}
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Masuk</h2>
          <p className="text-sm text-gray-500 mb-6">Gunakan akun staf internal.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@demo.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
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
              {loading ? 'Memproses...' : 'Masuk'}
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
                {a.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

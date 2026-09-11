import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listUsers, createUser, updateUser } from '../api/users'
import { listPermissions, getRolePermissionMatrix, updateRolePermissionMatrix } from '../api/rolePermissions'

const roleOptions = [
  { key: 'super_user' },
  { key: 'management' },
  { key: 'spv' },
  { key: 'sales' },
]

function AddStaffForm({ onCreated }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('sales')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setTempPassword('')
    try {
      const res = await createUser({ name, email, role })
      setTempPassword(res.temp_password)
      setName('')
      setEmail('')
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || t('page_roles.add_staff_failed_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end mb-4">
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_roles.name_label')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_roles.email_label')}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_roles.role_label')}</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          {roleOptions.map((r) => <option key={r.key} value={r.key}>{t(`page_roles.role_${r.key}`)}</option>)}
        </select>
      </div>
      <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50">
        {saving ? t('page_roles.adding') : t('page_roles.add_staff_button')}
      </button>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      {tempPassword && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 w-full">
          {t('page_roles.account_created_message')} <span className="font-mono font-bold">{tempPassword}</span>
        </p>
      )}
    </form>
  )
}

export default function RolesMatrix() {
  const { t } = useTranslation()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState([])
  const [roles, setRoles] = useState([])
  const [matrix, setMatrix] = useState({})
  const [matrixSaving, setMatrixSaving] = useState(false)
  const [matrixSaved, setMatrixSaved] = useState(false)

  function reload() {
    listUsers().then((data) => { setUsers(data); setLoading(false) })
  }

  function reloadMatrix() {
    listPermissions().then(setPermissions)
    getRolePermissionMatrix().then((res) => {
      setRoles(res.roles.filter((r) => r !== 'customer'))
      setMatrix(res.matrix)
    })
  }

  useEffect(reload, [])
  useEffect(reloadMatrix, [])

  function toggleMatrix(role, key) {
    setMatrix((m) => {
      const current = m[role] || []
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
      return { ...m, [role]: next }
    })
  }

  async function saveMatrix() {
    setMatrixSaving(true)
    setMatrixSaved(false)
    try {
      await updateRolePermissionMatrix(matrix)
      setMatrixSaved(true)
      setTimeout(() => setMatrixSaved(false), 2000)
    } finally {
      setMatrixSaving(false)
    }
  }

  const permsByGroup = permissions.reduce((acc, p) => {
    (acc[p.group_name] = acc[p.group_name] || []).push(p)
    return acc
  }, {})

  // permission `key`/`group_name` are real backend data (seeded in the permissions table), so
  // they can't carry translations themselves - map the known, stable set to translated labels
  // client-side, falling back to the raw backend value for any future permission not yet mapped.
  function permissionLabel(p) {
    return t(`page_roles.permission.${p.key.replace(/\./g, '_')}`, p.description)
  }
  function groupLabel(group) {
    const key = { Pelanggan: 'customers', Pengaturan: 'settings', Pengiriman: 'shipping', Pesanan: 'orders', Produk: 'products', Sistem: 'system' }[group]
    return key ? t(`page_roles.group.${key}`) : group
  }

  async function toggleActive(u) {
    await updateUser(u.id, { is_active: !u.is_active })
    reload()
  }

  async function changeRole(u, role) {
    await updateUser(u.id, { role })
    reload()
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">{t('page_roles.staff_section_title')}</h2>
        <AddStaffForm onCreated={reload} />
        {loading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : (
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                    {roleOptions.map((r) => <option key={r.key} value={r.key}>{t(`page_roles.role_${r.key}`)}</option>)}
                  </select>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.is_active ? t('page_roles.active_label') : t('page_roles.inactive_label')}
                  </span>
                  <button onClick={() => toggleActive(u)} className="text-xs font-semibold text-brand-600 hover:underline">
                    {u.is_active ? t('page_roles.deactivate_button') : t('page_roles.activate_button')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-800">{t('page_roles.permission_matrix_title')}</h2>
          <div className="flex items-center gap-2">
            {matrixSaved && <span className="text-xs text-green-600">{t('page_roles.saved_label')}</span>}
            <button onClick={saveMatrix} disabled={matrixSaving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
              {matrixSaving ? t('page_roles.saving') : t('common.save')}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {t('page_roles.matrix_hint')}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase border-b">
              <th className="p-2">{t('page_roles.col_permission')}</th>
              {roles.map((role) => <th key={role} className="p-2 text-center">{t(`page_roles.role_${role}`, role)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(permsByGroup).map(([group, perms]) => (
              <Fragment key={group}>
                <tr className="bg-gray-50">
                  <td colSpan={roles.length + 1} className="p-2 text-[11px] font-bold text-gray-400 uppercase">{groupLabel(group)}</td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key}>
                    <td className="p-2 text-gray-700">{permissionLabel(p)}</td>
                    {roles.map((role) => (
                      <td key={role} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={(matrix[role] || []).includes(p.key)}
                          onChange={() => toggleMatrix(role, p.key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

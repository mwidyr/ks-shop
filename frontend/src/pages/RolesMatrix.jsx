import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listUsers, createUser, updateUser, deleteUser, resendInvite, setUserPassword } from '../api/users'
import { listTabs, getRoleTabAccess, updateRoleTabAccess } from '../api/rolePermissions'
import { tableClasses, theadRowClasses, tbodyClasses, cardClasses } from '../components/Table'
import PasswordInput from '../components/PasswordInput'

const roleOptions = [
  { key: 'super_user' },
  { key: 'management' },
  { key: 'spv' },
  { key: 'sales' },
  { key: 'cs' },
  { key: 'warehouse' },
]

// Mirrors AppShell.jsx's navGroups grouping/order, so the matrix reads like the sidebar.
const TAB_GROUPS = [
  { titleKey: 'page_roles.group_general', tabs: ['dashboard', 'settings'] },
  { titleKey: 'nav.groups.sales', tabs: ['panel_siaran', 'orders', 'picking', 'shipping', 'chat', 'customers', 'reviews'] },
  { titleKey: 'nav.groups.catalog', tabs: ['products', 'categories', 'colors', 'inventory', 'warehouses', 'suppliers', 'purchases', 'purchase_requisitions', 'replenishment_planning', 'purchase_alert'] },
  { titleKey: 'nav.groups.fulfillment', tabs: ['returns', 'refunds'] },
  { titleKey: 'nav.groups.marketing', tabs: ['promotions', 'campaigns', 'advertising'] },
  { titleKey: 'nav.groups.analytics', tabs: ['sales_analytics', 'product_analytics', 'product_performance', 'product_color_pair', 'host_category_leaderboard', 'performance_dashboard', 'host_performance_analytics', 'heatmap', 'profit'] },
  { titleKey: 'nav.groups.finance', tabs: ['transactions', 'payouts', 'fees', 'reports'] },
  { titleKey: 'nav.groups.store', tabs: ['store_profile', 'shipping_settings', 'hosts', 'affiliates', 'store_design', 'team'] },
  { titleKey: 'nav.groups.system', tabs: ['notifications', 'integrations', 'roles', 'audit_logs'] },
]

// Lets an admin set a password directly for someone else's account - a workaround for when the
// invite/reset emails don't arrive, and a direct "change this person's password" tool. Separate
// from the password-input-only "confirm your OWN password" pattern used elsewhere (components/
// PasswordConfirmModal.jsx) - this one collects a NEW password for a DIFFERENT account.
function SetPasswordModal({ user, onClose, onDone }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('page_roles.set_password_mismatch'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await setUserPassword(user.id, password)
      onDone()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('page_roles.set_password_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800 mb-1">{t('page_roles.set_password_title')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('page_roles.set_password_desc', { name: user.name })}</p>
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_roles.set_password_new_label')}</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_roles.set_password_confirm_label')}</label>
        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 px-3 py-2 hover:underline">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            {busy ? t('page_roles.set_password_busy') : t('page_roles.set_password_submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

function tabLabel(t, tab) {
  if (tab === 'dashboard') return t('nav.dashboard')
  if (tab === 'settings') return t('nav.settings')
  return t(`nav.items.${tab}`)
}

function AddStaffForm({ onCreated }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('sales')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [invitedEmail, setInvitedEmail] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setInvitedEmail('')
    try {
      await createUser({ name, email, role })
      setInvitedEmail(email)
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
      {invitedEmail && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 w-full">
          {t('page_roles.account_created_message', { email: invitedEmail })}
        </p>
      )}
    </form>
  )
}

export default function RolesMatrix() {
  const { t } = useTranslation()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState([])
  const [matrix, setMatrix] = useState({})
  const [matrixSaving, setMatrixSaving] = useState(false)
  const [matrixSaved, setMatrixSaved] = useState(false)
  const [rowError, setRowError] = useState({})
  const [resentId, setResentId] = useState(null)
  const [editingEmailId, setEditingEmailId] = useState(null)
  const [editEmailValue, setEditEmailValue] = useState('')
  const [passwordModalUser, setPasswordModalUser] = useState(null)

  function reload() {
    listUsers().then((data) => { setUsers(data); setLoading(false) })
  }

  function reloadMatrix() {
    getRoleTabAccess().then((res) => {
      setRoles(res.roles)
      setMatrix(res.matrix)
    })
  }

  useEffect(reload, [])
  useEffect(reloadMatrix, [])

  function setCell(role, tab, level) {
    setMatrix((m) => {
      const roleMap = { ...(m[role] || {}) }
      if (level === 'none') delete roleMap[tab]
      else roleMap[tab] = level
      return { ...m, [role]: roleMap }
    })
  }

  async function saveMatrix() {
    setMatrixSaving(true)
    setMatrixSaved(false)
    try {
      await updateRoleTabAccess(matrix)
      setMatrixSaved(true)
      setTimeout(() => setMatrixSaved(false), 2000)
    } finally {
      setMatrixSaving(false)
    }
  }

  async function toggleActive(u) {
    await updateUser(u.id, { is_active: !u.is_active })
    reload()
  }

  async function changeRole(u, role) {
    await updateUser(u.id, { role })
    reload()
  }

  async function handleDelete(u) {
    if (!window.confirm(t('page_roles.delete_confirm', { name: u.name }))) return
    setRowError((e) => ({ ...e, [u.id]: '' }))
    try {
      await deleteUser(u.id)
      reload()
    } catch (err) {
      setRowError((e) => ({ ...e, [u.id]: err.response?.data?.error || t('page_roles.delete_failed_error') }))
    }
  }

  async function handleResendInvite(u) {
    setRowError((e) => ({ ...e, [u.id]: '' }))
    try {
      await resendInvite(u.id)
      setResentId(u.id)
      setTimeout(() => setResentId(null), 2000)
    } catch (err) {
      setRowError((e) => ({ ...e, [u.id]: err.response?.data?.error || t('page_roles.resend_invite_failed_error') }))
    }
  }

  function startEditEmail(u) {
    setEditingEmailId(u.id)
    setEditEmailValue(u.email)
  }

  async function saveEmail(u) {
    setEditingEmailId(null)
    if (!editEmailValue.trim() || editEmailValue.trim() === u.email) return
    setRowError((e) => ({ ...e, [u.id]: '' }))
    try {
      await updateUser(u.id, { email: editEmailValue.trim() })
      reload()
    } catch (err) {
      setRowError((e) => ({ ...e, [u.id]: err.response?.data?.error || t('page_roles.email_update_failed') }))
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <div className={`${cardClasses} p-5`}>
        <h2 className="font-bold text-[var(--text-primary)] mb-4">{t('page_roles.staff_section_title')}</h2>
        <AddStaffForm onCreated={reload} />
        {loading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : (
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="py-2">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{u.name}</p>
                    {editingEmailId === u.id ? (
                      <input
                        autoFocus
                        type="email"
                        value={editEmailValue}
                        onChange={(e) => setEditEmailValue(e.target.value)}
                        onBlur={() => saveEmail(u)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEmail(u) } }}
                        className="text-xs border border-gray-300 rounded-lg px-1.5 py-0.5"
                      />
                    ) : (
                      <button type="button" onClick={() => startEditEmail(u)} className="text-xs text-gray-500 hover:underline">
                        {u.email}
                      </button>
                    )}
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
                    {!u.is_active && (
                      <button onClick={() => handleResendInvite(u)} className="text-xs font-semibold text-brand-600 hover:underline">
                        {resentId === u.id ? t('page_roles.resend_invite_sent') : t('page_roles.resend_invite_button')}
                      </button>
                    )}
                    <button onClick={() => setPasswordModalUser(u)} className="text-xs font-semibold text-brand-600 hover:underline">
                      {t('page_roles.set_password_button')}
                    </button>
                    <button onClick={() => handleDelete(u)} className="text-xs font-semibold text-red-600 hover:underline">
                      {t('page_roles.delete_button')}
                    </button>
                  </div>
                </div>
                {rowError[u.id] && <p className="text-xs text-red-600 mt-1 text-right">{rowError[u.id]}</p>}
              </div>
            ))}
          </div>
        )}
        {passwordModalUser && (
          <SetPasswordModal user={passwordModalUser} onClose={() => setPasswordModalUser(null)} onDone={reload} />
        )}
      </div>

      <div className={`${cardClasses} p-5 overflow-x-auto`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-[var(--text-primary)]">{t('page_roles.permission_matrix_title')}</h2>
          <div className="flex items-center gap-2">
            {matrixSaved && <span className="text-xs text-green-600">{t('page_roles.saved_label')}</span>}
            <button onClick={saveMatrix} disabled={matrixSaving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
              {matrixSaving ? t('page_roles.saving') : t('common.save')}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {t('page_roles.matrix_hint_v2')}
        </p>
        <table className={tableClasses}>
          <thead>
            <tr className={theadRowClasses}>
              <th className="p-2">{t('page_roles.col_tab')}</th>
              {roles.map((role) => <th key={role} className="p-2 text-center whitespace-nowrap">{t(`page_roles.role_${role}`, role)}</th>)}
            </tr>
          </thead>
          <tbody className={tbodyClasses}>
            {TAB_GROUPS.map((group) => (
              <Fragment key={group.titleKey}>
                <tr className="bg-[var(--table-header-bg)]">
                  <td colSpan={roles.length + 1} className="p-2 text-[11px] font-bold text-[var(--text-secondary)] uppercase">{t(group.titleKey)}</td>
                </tr>
                {group.tabs.map((tab) => (
                  <tr key={tab}>
                    <td className="p-2 text-[var(--text-primary)]">{tabLabel(t, tab)}</td>
                    {roles.map((role) => (
                      <td key={role} className="p-2 text-center">
                        <select
                          value={matrix[role]?.[tab] || 'none'}
                          onChange={(e) => setCell(role, tab, e.target.value)}
                          className="text-xs border border-gray-300 rounded-lg px-1.5 py-1"
                        >
                          <option value="none">{t('page_roles.access_none')}</option>
                          <option value="view">{t('page_roles.access_view')}</option>
                          <option value="edit">{t('page_roles.access_edit')}</option>
                        </select>
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

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listHosts, createHost, updateHost, deleteHost } from '../api/hosts'

function ReferenceTable({ title, items, fields, onCreate, onUpdate, onDelete, reload }) {
  const { t } = useTranslation()
  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, '']))
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await onCreate(form)
      setForm(emptyForm)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_hosts.save_error'))
    }
  }

  async function toggleActive(item) {
    await onUpdate(item.id, { ...item, is_active: !item.is_active })
    reload()
  }

  async function handleDelete(item) {
    setError('')
    try {
      await onDelete(item.id)
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_hosts.delete_error'))
    }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  }

  async function handleBulkDelete() {
    setError('')
    setBulkBusy(true)
    const results = await Promise.allSettled([...selected].map((id) => onDelete(id)))
    const fail = results.filter((r) => r.status === 'rejected').length
    if (fail > 0) setError(t('page_hosts.bulk_delete_result', { ok: results.length - fail, fail }))
    setSelected(new Set())
    setBulkBusy(false)
    reload()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">{title}</h2>
        {items.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={selected.size === items.length} onChange={toggleSelectAll} />
            {t('page_hosts.select_all')}
          </label>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-brand-50 border border-brand-200 rounded-lg p-2">
          <span className="text-xs font-medium text-brand-800">{t('page_hosts.selected_count', { count: selected.size })}</span>
          <button onClick={handleBulkDelete} disabled={bulkBusy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
            {bulkBusy ? t('page_hosts.deleting') : t('page_hosts.delete_selected')}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
        </div>
      )}

      <div className="divide-y mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
              <div>
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                {item.platform && <p className="text-xs text-gray-500">{item.platform}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {item.is_active ? t('page_hosts.active') : t('page_hosts.inactive')}
              </span>
              <button onClick={() => toggleActive(item)} className="text-xs text-brand-600 hover:underline">
                {item.is_active ? t('page_hosts.deactivate') : t('page_hosts.activate')}
              </button>
              <button onClick={() => handleDelete(item)} className="text-xs text-red-600 hover:underline">
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_hosts.empty_state')}</p>}
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
            <input
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              required={f.required}
            />
          </div>
        ))}
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
          {t('common.add')}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

export default function HostManagement() {
  const { t } = useTranslation()
  const [hosts, setHosts] = useState([])

  function reload() {
    listHosts(true).then(setHosts)
  }

  useEffect(reload, [])

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl">
      <ReferenceTable
        title={t('page_hosts.title')}
        items={hosts}
        fields={[
          { key: 'name', label: t('page_hosts.field_name'), required: true },
          { key: 'platform', label: t('page_hosts.field_platform') },
        ]}
        onCreate={createHost}
        onUpdate={updateHost}
        onDelete={deleteHost}
        reload={reload}
      />
    </div>
  )
}

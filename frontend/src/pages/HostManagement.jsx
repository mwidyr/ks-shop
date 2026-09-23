import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listHosts, createHost, updateHost, deleteHost } from '../api/hosts'
import { listLocations, createLocation, updateLocation, deleteLocation } from '../api/hostLocations'

// Builds the payload sent to onCreate/onUpdate from raw (string) form state,
// converting `numeric` fields to Number so int fields on the backend (e.g.
// host.location_id) don't get sent as JSON strings.
function toPayload(fields, form) {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.numeric ? (form[f.key] === '' ? null : Number(form[f.key])) : form[f.key]])
  )
}

function fieldInput(f, value, onChange) {
  if (f.type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        required={f.required}
      >
        {!f.required && <option value="">{f.emptyLabel || ''}</option>}
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
      required={f.required}
    />
  )
}

function ReferenceTable({ title, items, fields, onCreate, onUpdate, onDelete, reload, renderExtra }) {
  const { t } = useTranslation()
  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, '']))
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await onCreate(toPayload(fields, form))
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

  function startEdit(item) {
    setError('')
    setEditingId(item.id)
    setEditForm(Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? ''])))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
  }

  async function saveEdit(item) {
    setError('')
    try {
      await onUpdate(item.id, { ...item, ...toPayload(fields, editForm) })
      cancelEdit()
      reload()
    } catch (err) {
      setError(err.response?.data?.error || t('page_hosts.save_error'))
    }
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
          <div key={item.id} className="py-2">
            {editingId === item.id ? (
              <div className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-2">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
                    {fieldInput(f, editForm[f.key], (v) => setEditForm((s) => ({ ...s, [f.key]: v })))}
                  </div>
                ))}
                <button onClick={() => saveEdit(item)} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                  {t('common.save')}
                </button>
                <button onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">{t('common.cancel')}</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.name}</p>
                    {item.platform && <p className="text-xs text-gray-500">{item.platform}</p>}
                    {renderExtra && renderExtra(item)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.is_active ? t('page_hosts.active') : t('page_hosts.inactive')}
                  </span>
                  <button onClick={() => startEdit(item)} className="text-xs text-brand-600 hover:underline">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => toggleActive(item)} className="text-xs text-brand-600 hover:underline">
                    {item.is_active ? t('page_hosts.deactivate') : t('page_hosts.activate')}
                  </button>
                  <button onClick={() => handleDelete(item)} className="text-xs text-red-600 hover:underline">
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400 py-4">{t('page_hosts.empty_state')}</p>}
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
            {fieldInput(f, form[f.key], (v) => setForm((s) => ({ ...s, [f.key]: v })))}
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
  const [locations, setLocations] = useState([])
  const [locationFilter, setLocationFilter] = useState('')

  function reloadHosts(filter) {
    listHosts(true, filter || undefined).then(setHosts)
  }

  function reloadLocations() {
    listLocations(true).then(setLocations)
  }

  useEffect(() => reloadLocations(), [])
  useEffect(() => reloadHosts(locationFilter), [locationFilter])

  const shiftOptions = [
    { value: 'morning', label: t('page_hosts.shift_morning') },
    { value: 'middle', label: t('page_hosts.shift_middle') },
    { value: 'evening', label: t('page_hosts.shift_evening') },
  ]

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-3">{t('page_hosts.locations_title')}</h2>
        <ReferenceTable
          title=""
          items={locations}
          fields={[{ key: 'name', label: t('page_hosts.field_location'), required: true }]}
          onCreate={createLocation}
          onUpdate={updateLocation}
          onDelete={deleteLocation}
          reload={reloadLocations}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <label className="block text-[11px] text-gray-500 mb-1">{t('page_hosts.filter_location')}</label>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">{t('page_hosts.filter_all_locations')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <ReferenceTable
        title={t('page_hosts.title')}
        items={hosts}
        fields={[
          { key: 'name', label: t('page_hosts.field_name'), required: true },
          { key: 'platform', label: t('page_hosts.field_platform') },
          {
            key: 'location_id',
            label: t('page_hosts.field_location'),
            required: true,
            type: 'select',
            numeric: true,
            options: locations.map((l) => ({ value: l.id, label: l.name })),
          },
          {
            key: 'shift',
            label: t('page_hosts.field_shift'),
            type: 'select',
            emptyLabel: t('page_hosts.shift_none'),
            options: shiftOptions,
          },
        ]}
        onCreate={createHost}
        onUpdate={updateHost}
        onDelete={deleteHost}
        reload={() => reloadHosts(locationFilter)}
        renderExtra={(item) => (
          <p className="text-xs text-gray-500">
            {item.location_name}
            {item.shift ? ` · ${t(`page_hosts.shift_${item.shift}`)}` : ` · ${t('page_hosts.shift_none')}`}
          </p>
        )}
      />
    </div>
  )
}

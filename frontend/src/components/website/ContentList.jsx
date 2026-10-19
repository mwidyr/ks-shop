import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listContent } from '../../api/website'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '../../utils/hooks'
import { btnCls, cardCls, inputCls } from './Pickers'

export const CONTENT_PAGE_SIZE = 10
const LANGS = ['id', 'en', 'zh', 'vi']
const DATES = ['all', '7d', 'last_month', 'custom']

// 1 2 3 … 9 10 11 … 20: the first, last and the pages around the current one.
export function pageNumbers(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1])
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out = []
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] === 2) out.push(n - 1) // a one-page gap is just shown
    else if (i > 0 && n - list[i - 1] > 2) out.push('…')
    out.push(n)
  })
  return out
}

const shortDate = (iso) => {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The Style Content article list: search by title, language, date (last updated), sort and 10 per page.
// Everything is filtered, sorted and paged by the server; filters combine and any change returns to page 1.
export default function ContentList({ onOpen, onNew, reloadKey = 0 }) {
  const { t } = useTranslation()
  const c = (k, o) => t(`page_website.content.${k}`, o)
  const [lang, setLang] = useState('')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('updated_desc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const reqId = useRef(0)

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const filterKey = [lang, debouncedSearch.trim(), date, date === 'custom' ? `${from}|${to}` : '', sort].join('#')
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (n) => setPageState({ key: filterKey, page: n })
  useEffect(() => { setPageState((p) => (p.key === filterKey ? p : { key: filterKey, page: 1 })) }, [filterKey])

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    listContent({
      lang, q: debouncedSearch.trim(), date: date === 'all' ? '' : date,
      from: date === 'custom' ? from : '', to: date === 'custom' ? to : '', sort, page, page_size: CONTENT_PAGE_SIZE,
    }).then((res) => { if (id === reqId.current) { setData(res); setLoading(false) } })
      .catch(() => { if (id === reqId.current) setLoading(false) })
  }, [filterKey, page, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || []
  const total = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE))
  const firstRow = total === 0 ? 0 : (page - 1) * CONTENT_PAGE_SIZE + 1
  const lastRow = Math.min(page * CONTENT_PAGE_SIZE, total)
  const dateActive = date !== 'all'

  function reset() {
    setLang(''); setSearch(''); setDate('all'); setFrom(''); setTo(''); setSort('updated_desc'); setFilterOpen(false)
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 className="text-lg font-bold text-gray-800">{c('title')}</h1><p className="text-sm text-gray-500">{c('intro')}</p></div>
        <button type="button" onClick={onNew} className={btnCls}>{c('new')}</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['', ...LANGS].map((l) => (
          <button key={l || 'all'} type="button" onClick={() => setLang(l)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${lang === l ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>
            {l ? t(`page_website.common.language_${l}`) : c('all_langs')}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={c('search_placeholder')} className={`${inputCls} flex-1 mt-0`} />
        <button type="button" onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}
          className={`px-3 py-2 rounded-lg border text-sm ${dateActive ? 'border-brand-600 text-brand-600' : 'border-gray-300 text-gray-600'}`}>{c('filter')}</button>
        <button type="button" onClick={reset} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">{c('reset')}</button>
      </div>

      {filterOpen && (
        <div className={`${cardCls} space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-800">{c('date')}</span>
            <span className="text-xs text-gray-500">{c('date_hint')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DATES.map((d) => (
              <button key={d} type="button" onClick={() => setDate(d)} className={`px-3 py-2 rounded-lg border text-sm ${date === d ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>{c(`date_${d}`)}</button>
            ))}
          </div>
          {date === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-500">{c('date_from')}<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} /></label>
              <label className="text-xs text-gray-500">{c('date_to')}<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`} /></label>
            </div>
          )}
          <div className="flex justify-end"><button type="button" onClick={() => setFilterOpen(false)} className={btnCls}>{c('done')}</button></div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-gray-500">{c('articles_count', { count: total })}</span>
        <label className="flex items-center gap-2 text-sm text-gray-500">{c('sort_by')}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-transparent">
            <option value="updated_desc">{c('sort_updated_desc')}</option>
            <option value="updated_asc">{c('sort_updated_asc')}</option>
          </select>
        </label>
      </div>

      <div className={`${cardCls} overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`} aria-busy={loading}>
        {data && items.length === 0 ? <p className="text-sm text-gray-500">{c('empty')}</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 uppercase">
              <th className="py-2">{c('col_title')}</th><th>{c('col_status')}</th><th>{c('col_language')}</th><th>{c('col_updated')}</th><th className="text-right">{c('col_action')}</th>
            </tr></thead>
            <tbody className="divide-y">
              {items.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onOpen(x.id)}>
                  <td className="py-2"><p className="font-medium text-gray-800">{x.title}</p><p className="text-xs text-gray-400">#{x.id}</p></td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full border ${x.is_published ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}`}>{x.is_published ? c('live') : c('draft')}</span></td>
                  <td>{t(`page_website.common.language_${x.lang}`)}</td>
                  <td className="text-gray-500">{shortDate(x.updated_at)}</td>
                  <td className="text-right"><button type="button" onClick={(e) => { e.stopPropagation(); onOpen(x.id) }} className="px-3 py-1 rounded-lg border border-gray-300 text-xs">{c('edit')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-sm text-gray-500">
          <span>{c('showing', { from: firstRow, to: lastRow, total })}</span>
          {pages > 1 && (
            <nav className="flex items-center gap-1" aria-label="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 rounded-lg border border-gray-300 disabled:opacity-40" aria-label="previous">‹</button>
              {pageNumbers(page, pages).map((n, i) => (n === '…'
                ? <span key={`gap${i}`} className="w-8 text-center">…</span>
                : <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}
                    className={`w-8 h-8 rounded-lg border ${n === page ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>{n}</button>))}
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="w-8 h-8 rounded-lg border border-gray-300 disabled:opacity-40" aria-label="next">›</button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}

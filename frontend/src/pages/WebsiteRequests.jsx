import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProductReviews, listRestockRequests, listWebReturns, markRestockNotified, setReviewStatus, setWebReturnStatus } from '../api/website'
import { btnGhost, cardCls } from '../components/website/Pickers'

export default function WebsiteRequests() {
  const { t } = useTranslation()
  const r = (k, o) => t(`page_website.requests.${k}`, o)
  const [tab, setTab] = useState('returns')
  const [restock, setRestock] = useState([])
  const [returns, setReturns] = useState([])
  const [reviews, setReviews] = useState([])
  const load = () => { listRestockRequests().then(setRestock).catch(() => {}); listWebReturns().then(setReturns).catch(() => {}); listProductReviews().then(setReviews).catch(() => {}) }
  useEffect(load, [])
  const fmt = (iso) => new Date(iso).toLocaleString()
  const waLink = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '886')}`

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-4">
      <h1 className="text-lg font-bold text-gray-800">{r('title')}</h1>
      <div className="flex gap-2">
        {['returns', 'restock', 'reviews'].map((k) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${tab === k ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>{r(k)} ({k === 'returns' ? returns.length : k === 'restock' ? restock.length : reviews.length})</button>)}
      </div>
      <div className={`${cardCls} overflow-x-auto`}>
        {tab === 'returns' ? (
          returns.length === 0 ? <p className="text-sm text-gray-500">{r('empty')}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{r('order')}</th><th>{r('customer')}</th><th>{r('kind')}</th><th>{r('reason')}</th><th>{r('status')}</th><th /></tr></thead>
              <tbody className="divide-y">
                {returns.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="py-2"><a className="text-brand-700 underline" href={`/orders/${x.order_id}`}>{x.order_no}</a><div className="text-xs text-gray-400">{fmt(x.created_at)}</div></td>
                    <td>{x.customer}<div className="text-xs text-gray-400">{x.phone}</div></td>
                    <td>{r(`k_${x.kind}`)}</td>
                    <td>{x.reason}{x.note ? <div className="text-xs text-gray-500">{x.note}</div> : null}</td>
                    <td>
                      <select value={x.status} onChange={(e) => setWebReturnStatus(x.id, e.target.value).then(load)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
                        {['new', 'processing', 'done', 'rejected'].map((s) => <option key={s} value={s}>{r(`s_${s}`)}</option>)}
                      </select>
                    </td>
                    <td><a href={waLink(x.phone)} target="_blank" rel="noreferrer" className={btnGhost}>{r('wa')}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'reviews' ? (
          reviews.length === 0 ? <p className="text-sm text-gray-500">{r('empty')}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{r('product')}</th><th>{r('rating')}</th><th>{r('review')}</th><th>{r('status')}</th></tr></thead>
              <tbody className="divide-y">
                {reviews.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="py-2">{x.product}<div className="text-xs text-gray-400">{x.name}・{fmt(x.created_at)}</div></td>
                    <td className="whitespace-nowrap">{'★'.repeat(x.rating)}{'☆'.repeat(5 - x.rating)}</td>
                    <td className="max-w-md">{x.body || '—'}</td>
                    <td>
                      <select value={x.status} onChange={(e) => setReviewStatus(x.id, e.target.value).then(load)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
                        {['pending', 'approved', 'hidden'].map((s) => <option key={s} value={s}>{r(`s_${s}`)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          restock.length === 0 ? <p className="text-sm text-gray-500">{r('empty')}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{r('product')}</th><th>{r('contact')}</th><th>{r('when')}</th><th>{r('notified')}</th></tr></thead>
              <tbody className="divide-y">
                {restock.map((x) => (
                  <tr key={x.id}>
                    <td className="py-2">{x.product}<div className="text-xs text-gray-400">{[x.color, x.size].filter(Boolean).join(' / ')}</div></td>
                    <td>{x.contact}</td><td>{fmt(x.created_at)}</td>
                    <td>{x.notified_at ? fmt(x.notified_at) : <button type="button" onClick={() => markRestockNotified(x.id).then(load)} className={btnGhost}>{r('mark_notified')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}

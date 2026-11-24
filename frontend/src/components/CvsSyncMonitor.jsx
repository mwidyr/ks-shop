import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCvsSyncStatus } from '../api/activityLog'
import { cardClasses } from './Table'

const STATUS_STYLE = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-US') : null)
const fmtNum = (n) => (n == null ? '-' : Number(n).toLocaleString('en-US'))

function Stat({ label, children }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className="text-sm font-medium text-[var(--text-primary)]">{children}</div>
    </div>
  )
}

function ChainCard({ chain }) {
  const { t } = useTranslation()
  const run = chain.last_run
  const errors = Array.isArray(run?.errors) ? run.errors : []
  const pct = run?.change_pct
  const pctClass = pct == null || pct === 0 ? '' : pct < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'

  return (
    <div className={`${cardClasses} p-4 flex-1 min-w-[280px]`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">{t(`page_audit_log.sync_chain_${chain.chain}`)}</h3>
        {run ? (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[run.status]}`}>
            {t(`page_audit_log.sync_status_${run.status}`)}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">{t('page_audit_log.sync_never')}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <Stat label={t('page_audit_log.sync_last_success')}>{fmtTime(chain.last_success_at) || t('page_audit_log.sync_none')}</Stat>
        </div>
        {run && (
          <>
            <Stat label={t('page_audit_log.sync_previous')}>{fmtNum(run.previous_count)}</Stat>
            <Stat label={t('page_audit_log.sync_current')}>{fmtNum(run.store_count)}</Stat>
            <Stat label={t('page_audit_log.sync_change')}>
              <span className={pctClass}>{pct == null ? '-' : `${pct > 0 ? '+' : ''}${pct}%`}</span>
            </Stat>
            <Stat label={t('page_audit_log.sync_in_db')}>{fmtNum(chain.stores_in_db)}</Stat>
            <div className="col-span-2">
              <Stat label={t('page_audit_log.sync_last_run')}>{fmtTime(run.received_at)}</Stat>
            </div>
          </>
        )}
      </div>

      {run && !run.applied && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{t('page_audit_log.sync_not_applied')}</p>
      )}

      {run && (
        <div className="mt-3">
          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('page_audit_log.sync_errors')}</div>
          {errors.length === 0 && !run.upload_error ? (
            <div className="text-sm text-[var(--text-secondary)]">{t('page_audit_log.sync_no_errors')}</div>
          ) : (
            <ul className="max-h-40 overflow-y-auto text-xs font-mono text-red-700 dark:text-red-300 space-y-1">
              {run.upload_error && <li>{t('page_audit_log.sync_upload_error')}: {run.upload_error}</li>}
              {errors.map((e, i) => (
                <li key={i} className="break-words">
                  {[e.city, e.area].filter(Boolean).join(' ')}{e.city || e.area ? ': ' : ''}{e.error}
                </li>
              ))}
              {run.error_count > errors.length && (
                <li className="text-[var(--text-secondary)]">{t('page_audit_log.sync_errors_more', { count: run.error_count - errors.length })}</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function CvsSyncMonitor() {
  const { t } = useTranslation()
  const [chains, setChains] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getCvsSyncStatus().then((res) => setChains(res.chains)).catch(() => setFailed(true))
  }, [])

  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('page_audit_log.sync_title')}</h2>
      <p className="text-xs text-[var(--text-secondary)] mb-3">{t('page_audit_log.sync_subtitle')}</p>
      {failed && <p className="text-sm text-red-600 dark:text-red-400">{t('page_audit_log.sync_load_failed')}</p>}
      {chains && (
        <div className="flex flex-wrap gap-4">
          {chains.map((c) => <ChainCard key={c.chain} chain={c} />)}
        </div>
      )}
    </section>
  )
}

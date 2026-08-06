/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import {
  AdminApiRequestError,
  fetchEmailMetrics,
} from '@/admin/api/adminApi'
import type { AdminEmailMetrics } from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import styles from '@/admin/styles/admin.module.css'

export function AdminEmailsPage() {
  const [data, setData] = useState<AdminEmailMetrics | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )

  async function load() {
    setState('loading')
    try {
      setData(await fetchEmailMetrics())
      setState('ready')
    } catch (err) {
      setState(
        err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed'
          ? 'forbidden'
          : 'error',
      )
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div>
      <div data-testid="admin-emails">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>E-maile</h1>
            <p className={styles.pageLead}>
              Dostarczalność na podstawie zapisanych zdarzeń webhook Resend.
            </p>
          </div>
        </header>

        {state === 'loading' ? <AdminStateMessage state="loading" /> : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load()}
          />
        ) : null}

        {state === 'ready' && data ? (
          <>
            <p className={styles.freshness}>{formatUpdatedAt(data.updatedAt)}</p>
            {data.status === 'not_collecting' ? (
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>{data.message}</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>SMTP</span>
                    <strong>
                      {data.smtpConfigured === true
                        ? 'Skonfigurowany'
                        : data.smtpConfigured === false
                          ? 'Nie'
                          : 'Nie można potwierdzić stanu'}
                    </strong>
                  </li>
                  <li>
                    <span>Webhook</span>
                    <strong>
                      {data.webhookConnected
                        ? 'Podłączony'
                        : 'Niepodłączony lub brak zdarzeń'}
                    </strong>
                  </li>
                </ul>
                <p className={styles.metricDef}>
                  Brak statystyk przed pierwszym zapisanym zdarzeniem. Sukces SMTP nie
                  oznacza dostarczenia.
                </p>
              </article>
            ) : (
              <div className={styles.metricRow}>
                {(
                  [
                    ['Wysłane', data.sent],
                    ['Dostarczone', data.delivered],
                    ['Odbite', data.bounced],
                    ['Nieudane', data.failed],
                    ['Skargi', data.complained],
                    ['Suppressed', data.suppressed],
                    ['Opóźnione', data.deliveryDelayed],
                  ] as const
                ).map(([label, value]) => (
                  <article key={label} className={styles.metricCard}>
                    <h2>{label}</h2>
                    <p className={styles.metricValue}>{value}</p>
                  </article>
                ))}
                <p className={styles.metricDef}>
                  Ostatnie zdarzenie:{' '}
                  {formatAdminDateTime(data.lastEventAt)}
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

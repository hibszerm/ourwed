/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import {
  AdminApiRequestError,
  fetchIntegrationHealth,
} from '@/admin/api/adminApi'
import type { AdminIntegrationHealth } from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import styles from '@/admin/styles/admin.module.css'

export function AdminIntegrationsPage() {
  const [data, setData] = useState<AdminIntegrationHealth | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )

  async function load() {
    setState('loading')
    try {
      setData(await fetchIntegrationHealth())
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
      <div data-testid="admin-integrations">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Integracje</h1>
            <p className={styles.pageLead}>
              Agregaty stanu połączeń bez sekretów i danych klientów.
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
            <div className={styles.detailGrid}>
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Google Calendar</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Połączone konta</span>
                    <strong>{data.google.connected}</strong>
                  </li>
                  <li>
                    <span>Włączone</span>
                    <strong>{data.google.enabled}</strong>
                  </li>
                  <li>
                    <span>Z błędem</span>
                    <strong>{data.google.withError}</strong>
                  </li>
                  <li>
                    <span>Ostatnia udana synchronizacja</span>
                    <strong>
                      {formatAdminDateTime(data.google.lastSuccessfulSyncAt)}
                    </strong>
                  </li>
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Apple Calendar</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Aktywne feedy</span>
                    <strong>{data.apple.enabled}</strong>
                  </li>
                  <li>
                    <span>Z błędem</span>
                    <strong>{data.apple.withError}</strong>
                  </li>
                  <li>
                    <span>Ostatnia udana synchronizacja</span>
                    <strong>
                      {formatAdminDateTime(data.apple.lastSuccessfulSyncAt)}
                    </strong>
                  </li>
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Resend</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>SMTP</span>
                    <strong>
                      {data.resend.smtpConfigured === true
                        ? 'Tak'
                        : data.resend.smtpConfigured === false
                          ? 'Nie'
                          : 'Nie można potwierdzić'}
                    </strong>
                  </li>
                  <li>
                    <span>Webhook</span>
                    <strong>
                      {data.resend.webhookConnected ? 'Zdarzenia zapisane' : 'Niepodłączone'}
                    </strong>
                  </li>
                  <li>
                    <span>Ostatnie zdarzenie</span>
                    <strong>
                      {formatAdminDateTime(data.resend.lastWebhookEventAt)}
                    </strong>
                  </li>
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Supabase</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Baza danych</span>
                    <strong>
                      {data.supabase.database === 'ok' ? 'Działa' : 'Problem'}
                    </strong>
                  </li>
                  <li>
                    <span>Admin RPC</span>
                    <strong>
                      {data.supabase.adminRpc === 'ok' ? 'Działa' : 'Problem'}
                    </strong>
                  </li>
                </ul>
              </article>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

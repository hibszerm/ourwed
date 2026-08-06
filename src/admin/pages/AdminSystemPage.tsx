/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import {
  AdminApiRequestError,
  fetchSystemHealth,
} from '@/admin/api/adminApi'
import type { AdminSystemHealth } from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { getAdminDeploymentInfo } from '@/admin/lib/deploymentInfo'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import styles from '@/admin/styles/admin.module.css'

function checkLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'Działa'
    case 'error':
      return 'Problem'
    case 'not_connected':
      return 'Niepodłączone'
    default:
      return 'Nie można potwierdzić'
  }
}

export function AdminSystemPage() {
  const [data, setData] = useState<AdminSystemHealth | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const deploy = getAdminDeploymentInfo()

  async function load() {
    setState('loading')
    try {
      setData(await fetchSystemHealth())
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
      <div data-testid="admin-system">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Zdrowie systemu</h1>
            <p className={styles.pageLead}>
              Kontrole na żądanie. Bez twierdzeń o uptime bez historii monitoringu.
            </p>
          </div>
          <button type="button" className={styles.secondaryBtn} onClick={() => void load()}>
            Sprawdź ponownie
          </button>
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
            <p className={styles.freshness}>{formatUpdatedAt(data.checkedAt)}</p>
            <div className={styles.detailGrid}>
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Kontrole</h2>
                <ul className={styles.usageList}>
                  {data.checks.map((c) => (
                    <li key={c.id}>
                      <span>
                        {c.label}
                        {c.durationMs != null ? ` · ${c.durationMs} ms` : ''}
                      </span>
                      <strong>
                        {c.id === 'uptime'
                          ? 'Nie można potwierdzić stanu'
                          : checkLabel(c.status)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Wdrożenie</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Środowisko</span>
                    <strong>{deploy.environmentLabel}</strong>
                  </li>
                  <li>
                    <span>Host</span>
                    <strong>{deploy.host ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Branch</span>
                    <strong>{deploy.branch ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Commit</span>
                    <strong>{deploy.shortSha ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Tryb build</span>
                    <strong>{deploy.mode}</strong>
                  </li>
                </ul>
                <p className={styles.metricDef}>
                  Metadane Vercel tylko gdy wstrzyknięte przy buildzie. Brak wartości nie
                  jest zastępowany fikcyjnymi danymi.
                </p>
              </article>
            </div>
            <p className={styles.metricDef}>
              Ostatnie sprawdzenie: {formatAdminDateTime(data.checkedAt)}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}

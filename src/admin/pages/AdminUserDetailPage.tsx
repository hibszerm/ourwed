/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AdminApiRequestError,
  fetchUserSummary,
} from '@/admin/api/adminApi'
import type { AdminUserSummary } from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import {
  adminDisplayName,
  adminOptionalText,
} from '@/admin/lib/adminIdentityDisplay'
import styles from '@/admin/styles/admin.module.css'

function accountStateLabel(data: AdminUserSummary): string {
  if (data.bannedUntil && new Date(data.bannedUntil).getTime() > Date.now()) {
    return 'Zablokowane'
  }
  if (!data.emailConfirmed) return 'Niepotwierdzony e-mail'
  if (
    !data.lastSignInAt ||
    new Date(data.lastSignInAt).getTime() < Date.now() - 90 * 24 * 60 * 60 * 1000
  ) {
    return 'Brak aktywności'
  }
  return 'Aktywne'
}

export function AdminUserDetailPage() {
  const { userId = '' } = useParams()
  const [data, setData] = useState<AdminUserSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function load() {
    setState('loading')
    setErrorMessage(null)
    try {
      const summary = await fetchUserSummary(userId)
      setData(summary)
      setState('ready')
      void appendAdminAuditEvent({
        action: 'admin.user_lookup',
        targetType: 'user',
        targetId: userId,
        metadata: { ok: true },
      })
    } catch (err) {
      void appendAdminAuditEvent({
        action: 'admin.user_lookup',
        targetType: 'user',
        targetId: userId,
        metadata: { ok: false },
      })
      if (err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed') {
        setState('forbidden')
      } else {
        setState('error')
      }
      setErrorMessage(
        err instanceof AdminApiRequestError
          ? err.message
          : 'Nie udało się pobrać danych',
      )
    }
  }

  useEffect(() => {
    if (userId) void load()
  }, [userId])

  return (
    <div>
      <div data-testid="admin-user-detail">
        <p className={styles.backLink}>
          <Link to="/users">← Użytkownicy</Link>
        </p>

        {state === 'loading' ? <AdminStateMessage state="loading" /> : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load()}
          >
            {errorMessage}
          </AdminStateMessage>
        ) : null}

        {state === 'ready' && data ? (
          <>
            <header className={styles.pageHeader}>
              <div>
                <h1 className={styles.sans}>{adminDisplayName(data.displayName)}</h1>
                <p className={styles.pageLead}>{data.email ?? '—'}</p>
                <p className={styles.metricDef}>usr_{data.shortId}</p>
              </div>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void load()}
              >
                Odśwież
              </button>
            </header>
            <p className={styles.freshness}>{formatUpdatedAt(data.lookedUpAt)}</p>
            <p className={styles.privacyNote}>
              Widok zawiera dane konta potrzebne do obsługi platformy. Nie pokazuje
              danych par, umów ani odpowiedzi z ankiet.
            </p>

            <section className={styles.detailGrid}>
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Konto</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Imię</span>
                    <strong>{adminOptionalText(data.firstName)}</strong>
                  </li>
                  <li>
                    <span>Nazwisko</span>
                    <strong>{adminOptionalText(data.lastName)}</strong>
                  </li>
                  <li>
                    <span>Adres e-mail</span>
                    <strong className={styles.emailCell}>{data.email ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Data rejestracji</span>
                    <strong>{formatAdminDateTime(data.createdAt)}</strong>
                  </li>
                  <li>
                    <span>Potwierdzenie e-mail</span>
                    <strong>{data.emailConfirmed ? 'Tak' : 'Nie'}</strong>
                  </li>
                  <li>
                    <span>Ostatnie logowanie</span>
                    <strong>{formatAdminDateTime(data.lastSignInAt)}</strong>
                  </li>
                  <li>
                    <span>Stan konta</span>
                    <strong>{accountStateLabel(data)}</strong>
                  </li>
                  <li>
                    <span>Zweryfikowane czynniki MFA</span>
                    <strong>{data.mfaFactors}</strong>
                  </li>
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Wykorzystanie</h2>
                <ul className={styles.usageList}>
                  <li>
                    <span>Śluby</span>
                    <strong>{data.usage.weddings}</strong>
                  </li>
                  <li>
                    <span>Sesje</span>
                    <strong>{data.usage.sessions}</strong>
                  </li>
                  <li>
                    <span>Dokumenty</span>
                    <strong>{data.usage.documents}</strong>
                  </li>
                  <li>
                    <span>Ankiety</span>
                    <strong>{data.usage.questionnaires}</strong>
                  </li>
                  <li>
                    <span>Wpłaty</span>
                    <strong>{data.usage.payments}</strong>
                  </li>
                  <li>
                    <span>Integracje kalendarza</span>
                    <strong>{data.usage.calendarIntegrations}</strong>
                  </li>
                </ul>
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Integracje</h2>
                {data.integrations.length === 0 ? (
                  <p className={styles.metricDef}>Brak rekordów integracji.</p>
                ) : (
                  <ul className={styles.usageList}>
                    {data.integrations.map((i) => (
                      <li key={i.provider}>
                        <span>{i.provider}</span>
                        <strong>
                          {i.enabled ? 'aktywna' : 'nieaktywna'}
                          {i.lastErrorCode ? ` · ${i.lastErrorCode}` : ''}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>E-maile</h2>
                <AdminStateMessage state="unavailable">
                  Statystyki dostarczalności nie są jeszcze zbierane.
                </AdminStateMessage>
              </article>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

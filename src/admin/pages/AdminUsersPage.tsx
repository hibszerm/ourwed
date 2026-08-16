/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AdminApiRequestError,
  fetchUserList,
} from '@/admin/api/adminApi'
import type {
  AdminSubscriptionFilter,
  AdminUserListResult,
  AdminUserStatus,
} from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import { adminDisplayName } from '@/admin/lib/adminIdentityDisplay'
import { adminSubscriptionBadge } from '@/lib/billing/entitlement'
import styles from '@/admin/styles/admin.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

const PAGE_SIZE = 25

const STATUS_LABEL: Record<AdminUserStatus, string> = {
  active: 'Aktywne',
  unconfirmed: 'Niepotwierdzony e-mail',
  banned: 'Zablokowane',
  inactive: 'Brak aktywności',
}

const SUB_FILTERS: Array<{ id: AdminSubscriptionFilter | ''; label: string }> = [
  { id: '', label: 'Wszystkie subskrypcje' },
  { id: 'trial', label: 'Okres próbny' },
  { id: 'trial_ending', label: 'Okres próbny kończy się ≤7 dni' },
  { id: 'pro', label: 'PRO' },
  { id: 'expired', label: 'Wygasł' },
  { id: 'manual', label: 'Ręczny dostęp' },
  { id: 'past_due', label: 'Problem z płatnością' },
]

export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AdminUserStatus | ''>('')
  const [subscriptionFilter, setSubscriptionFilter] = useState<
    AdminSubscriptionFilter | ''
  >('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<AdminUserListResult | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function load(
    nextOffset: number,
    nextSearch: string,
    nextStatus: string,
    nextSub: AdminSubscriptionFilter | '',
  ) {
    setState('loading')
    setErrorMessage(null)
    try {
      const result = await fetchUserList({
        limit: PAGE_SIZE,
        offset: nextOffset,
        search: nextSearch.trim() || null,
        status: (nextStatus || null) as AdminUserStatus | null,
        subscriptionFilter: (nextSub || null) as AdminSubscriptionFilter | null,
      })
      setData(result)
      setOffset(nextOffset)
      setState('ready')
    } catch (err) {
      if (err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed') {
        setState('forbidden')
      } else {
        setState('error')
      }
      setErrorMessage(
        err instanceof AdminApiRequestError
          ? getUserFacingErrorMessage(err, 'Nie udało się wykonać operacji. Spróbuj ponownie.')
          : 'Nie udało się pobrać danych',
      )
    }
  }

  useEffect(() => {
    void load(0, '', '', '')
  }, [])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    void load(0, search, status, subscriptionFilter)
  }

  return (
    <div>
      <div data-testid="admin-users">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Użytkownicy</h1>
            <p className={styles.pageLead}>
              Konta i wykorzystanie produktu bez dostępu do prywatnej treści klientów.
            </p>
            <p className={styles.privacyNote}>
              Widok zawiera dane konta potrzebne do obsługi platformy. Nie pokazuje
              danych par, umów ani odpowiedzi z ankiet.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void load(offset, search, status, subscriptionFilter)}
          >
            Odśwież
          </button>
        </header>

        <form className={styles.toolbar} onSubmit={onSearch}>
          <input
            className={styles.toolbarInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="E-mail, imię, nazwisko lub ID"
            aria-label="Szukaj"
          />
          <select
            className={styles.toolbarInput}
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminUserStatus | '')}
            aria-label="Status"
          >
            <option value="">Wszystkie stany</option>
            <option value="active">Aktywne</option>
            <option value="unconfirmed">Niepotwierdzony e-mail</option>
            <option value="banned">Zablokowane</option>
            <option value="inactive">Brak aktywności</option>
          </select>
          <select
            className={styles.toolbarInput}
            value={subscriptionFilter}
            onChange={(e) =>
              setSubscriptionFilter(e.target.value as AdminSubscriptionFilter | '')
            }
            aria-label="Subskrypcja"
          >
            {SUB_FILTERS.map((f) => (
              <option key={f.id || 'all'} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.primaryBtn} style={{ width: 'auto' }}>
            Filtruj
          </button>
        </form>

        <p className={styles.freshness}>
          {state === 'ready' ? formatUpdatedAt(data?.updatedAt) : null}
        </p>

        {state === 'loading' ? <AdminStateMessage state="loading" /> : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load(offset, search, status, subscriptionFilter)}
          >
            {errorMessage}
          </AdminStateMessage>
        ) : null}

        {state === 'ready' && data ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Użytkownik</th>
                    <th>E-mail</th>
                    <th>Stan</th>
                    <th>Subskrypcja</th>
                    <th>Rejestracja</th>
                    <th>Ostatnie logowanie</th>
                    <th>Śluby</th>
                    <th>Sesje</th>
                    <th>Dokumenty</th>
                    <th>Integracje</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <AdminStateMessage state="empty">0</AdminStateMessage>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row) => (
                      <tr key={row.userId}>
                        <td>
                          <Link to={`/users/${row.userId}`} className={styles.tableLink}>
                            <div>{adminDisplayName(row.displayName)}</div>
                            <div className={styles.metricDef}>usr_{row.shortId}</div>
                          </Link>
                        </td>
                        <td>
                          <span className={styles.emailCell} title={row.email ?? undefined}>
                            {row.email ?? '—'}
                          </span>
                        </td>
                        <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                        <td>
                          {row.entitlement
                            ? adminSubscriptionBadge(row.entitlement)
                            : '—'}
                        </td>
                        <td>{formatAdminDateTime(row.createdAt)}</td>
                        <td>{formatAdminDateTime(row.lastSignInAt)}</td>
                        <td>{row.weddings}</td>
                        <td>{row.sessions}</td>
                        <td>{row.documents}</td>
                        <td>{row.integrations}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pager}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={offset <= 0}
                onClick={() =>
                  void load(
                    Math.max(0, offset - PAGE_SIZE),
                    search,
                    status,
                    subscriptionFilter,
                  )
                }
              >
                Poprzednia
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} / {data.total}
              </span>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() =>
                  void load(offset + PAGE_SIZE, search, status, subscriptionFilter)
                }
              >
                Następna
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

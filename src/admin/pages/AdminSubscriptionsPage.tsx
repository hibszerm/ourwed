/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AdminApiRequestError,
  fetchSubscriptionList,
  fetchSubscriptionMetrics,
} from '@/admin/api/adminApi'
import type {
  AdminSubscriptionFilter,
  AdminSubscriptionListResult,
  AdminSubscriptionMetrics,
} from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { formatAdminDateTime } from '@/admin/lib/adminFormat'
import {
  adminSubscriptionBadge,
  formatWarsawDate,
  type AccountEntitlement,
} from '@/lib/billing/entitlement'
import styles from '@/admin/styles/admin.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

const PAGE_SIZE = 50

const FILTERS: Array<{ id: AdminSubscriptionFilter | ''; label: string }> = [
  { id: '', label: 'Wszystkie' },
  { id: 'trial', label: 'Okres próbny' },
  { id: 'trial_ending', label: 'Okres próbny kończy się ≤7 dni' },
  { id: 'pro', label: 'PRO' },
  { id: 'expired', label: 'Wygasł' },
  { id: 'manual', label: 'Ręczny dostęp' },
  { id: 'past_due', label: 'Problem z płatnością' },
]

function sourceLabel(source: AccountEntitlement['source']): string {
  switch (source) {
    case 'trial':
      return 'Okres próbny'
    case 'paid_subscription':
      return 'Subskrypcja'
    case 'admin_override':
      return 'Ręczny'
    default:
      return '—'
  }
}

function planLabel(entitlement: AccountEntitlement): string {
  if (entitlement.billingInterval === 'year') return 'PRO roczny'
  if (entitlement.billingInterval === 'month') return 'PRO miesięczny'
  return 'PRO'
}

function accessEndLabel(entitlement: AccountEntitlement): string {
  if (entitlement.source === 'admin_override') {
    if (entitlement.manualAccessIndefinite) return 'Bezterminowo'
    return formatWarsawDate(entitlement.manualAccessUntil)
  }
  if (entitlement.source === 'paid_subscription') {
    return formatWarsawDate(entitlement.currentPeriodEndsAt)
  }
  if (entitlement.source === 'trial') {
    return formatWarsawDate(entitlement.trialEndsAt)
  }
  return formatWarsawDate(
    entitlement.manualAccessUntil ??
      entitlement.currentPeriodEndsAt ??
      entitlement.trialEndsAt,
  )
}

function accountLabel(row: {
  email: string | null
  firstName: string | null
  lastName: string | null
}): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
  if (name && row.email) return `${name} · ${row.email}`
  return name || row.email || '—'
}

export function AdminSubscriptionsPage() {
  const [filter, setFilter] = useState<AdminSubscriptionFilter | ''>('')
  const [offset, setOffset] = useState(0)
  const [metrics, setMetrics] = useState<AdminSubscriptionMetrics | null>(null)
  const [data, setData] = useState<AdminSubscriptionListResult | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function load(
    nextOffset: number,
    nextFilter: AdminSubscriptionFilter | '',
  ) {
    setState('loading')
    setErrorMessage(null)
    try {
      const [m, list] = await Promise.all([
        fetchSubscriptionMetrics(),
        fetchSubscriptionList({
          limit: PAGE_SIZE,
          offset: nextOffset,
          filter: (nextFilter || null) as AdminSubscriptionFilter | null,
        }),
      ])
      setMetrics(m)
      setData(list)
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
    void load(0, '')
  }, [])

  function onFilter(e: FormEvent) {
    e.preventDefault()
    void load(0, filter)
  }

  return (
    <div>
      <div data-testid="admin-subscriptions">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Subskrypcje</h1>
            <p className={styles.pageLead}>
              Dostęp i Trial działają · Płatności online: Niepodłączone
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void load(offset, filter)}
          >
            Odśwież
          </button>
        </header>

        {state === 'loading' ? <AdminStateMessage state="loading" /> : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load(offset, filter)}
          >
            {errorMessage}
          </AdminStateMessage>
        ) : null}

        {state === 'ready' && metrics ? (
          <section className={styles.metricRow} aria-label="Metryki dostępu">
            <article className={styles.metricCard}>
              <h2>Trial aktywny</h2>
              <p className={styles.metricValue}>{metrics.trialActive}</p>
            </article>
            <article className={styles.metricCard}>
              <h2>Kończy się ≤7 dni</h2>
              <p className={styles.metricValue}>{metrics.trialEndingSoon}</p>
            </article>
            <article className={styles.metricCard}>
              <h2>PRO aktywny</h2>
              <p className={styles.metricValue}>{metrics.proActive}</p>
            </article>
            <article className={styles.metricCard}>
              <h2>Wygasł</h2>
              <p className={styles.metricValue}>{metrics.expired}</p>
            </article>
            <article className={styles.metricCard}>
              <h2>Ręczny dostęp</h2>
              <p className={styles.metricValue}>{metrics.manualAccess}</p>
            </article>
          </section>
        ) : null}

        <form className={styles.toolbar} onSubmit={onFilter}>
          <select
            className={styles.toolbarInput}
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as AdminSubscriptionFilter | '')
            }
            aria-label="Filtr subskrypcji"
          >
            {FILTERS.map((f) => (
              <option key={f.id || 'all'} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.primaryBtn} style={{ width: 'auto' }}>
            Filtruj
          </button>
        </form>

        {state === 'ready' && data ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Konto</th>
                    <th>Status</th>
                    <th>Źródło</th>
                    <th>Plan</th>
                    <th>Koniec dostępu</th>
                    <th>Aktualizacja</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <AdminStateMessage state="empty">0</AdminStateMessage>
                      </td>
                    </tr>
                  ) : (
                    data.items.map((row) => (
                      <tr key={row.billingAccountId}>
                        <td>
                          <Link
                            to={`/users/${row.userId}`}
                            className={styles.tableLink}
                          >
                            {accountLabel(row)}
                          </Link>
                        </td>
                        <td>{adminSubscriptionBadge(row.entitlement)}</td>
                        <td>{sourceLabel(row.entitlement.source)}</td>
                        <td>{planLabel(row.entitlement)}</td>
                        <td>{accessEndLabel(row.entitlement)}</td>
                        <td>{formatAdminDateTime(row.updatedAt)}</td>
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
                  void load(Math.max(0, offset - PAGE_SIZE), filter)
                }
              >
                Poprzednia
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} /{' '}
                {data.total}
              </span>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => void load(offset + PAGE_SIZE, filter)}
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

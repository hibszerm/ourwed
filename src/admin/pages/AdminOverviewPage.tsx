/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AdminApiRequestError,
  fetchActivationFunnel,
  fetchAttentionItems,
  fetchOverviewMetrics,
  fetchProductUsage,
  fetchRegistrationSeries,
  fetchSystemHealth,
} from '@/admin/api/adminApi'
import type {
  AdminActivationFunnel,
  AdminAttentionPayload,
  AdminMetricRange,
  AdminOverviewMetrics,
  AdminProductUsage,
  AdminRegistrationSeries,
  AdminSystemHealth,
} from '@/admin/api/types'
import {
  AdminStateMessage,
  MetricValue,
} from '@/admin/components/AdminStateMessage'
import { formatUpdatedAt, pctOf } from '@/admin/lib/adminFormat'
import styles from '@/admin/styles/admin.module.css'

const RANGES: Array<{ id: AdminMetricRange; label: string }> = [
  { id: 'today', label: 'Dzisiaj' },
  { id: '7d', label: '7 dni' },
  { id: '30d', label: '30 dni' },
]

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden'

export function AdminOverviewPage() {
  const [range, setRange] = useState<AdminMetricRange>('30d')
  const [state, setState] = useState<LoadState>('loading')
  const [overview, setOverview] = useState<AdminOverviewMetrics | null>(null)
  const [series, setSeries] = useState<AdminRegistrationSeries | null>(null)
  const [usage, setUsage] = useState<AdminProductUsage | null>(null)
  const [funnel, setFunnel] = useState<AdminActivationFunnel | null>(null)
  const [attention, setAttention] = useState<AdminAttentionPayload | null>(null)
  const [system, setSystem] = useState<AdminSystemHealth | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function load(nextRange: AdminMetricRange) {
    setState('loading')
    setErrorMessage(null)
    try {
      const [o, s, u, f, a, h] = await Promise.all([
        fetchOverviewMetrics(nextRange),
        fetchRegistrationSeries(nextRange === 'today' ? 1 : nextRange === '7d' ? 7 : 30),
        fetchProductUsage(),
        fetchActivationFunnel(),
        fetchAttentionItems(),
        fetchSystemHealth(),
      ])
      setOverview(o)
      setSeries(s)
      setUsage(u)
      setFunnel(f)
      setAttention(a)
      setSystem(h)
      setState('ready')
    } catch (err) {
      if (err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed') {
        setState('forbidden')
        setErrorMessage(err.message)
      } else {
        setState('error')
        setErrorMessage(
          err instanceof AdminApiRequestError
            ? err.message
            : 'Nie udało się pobrać danych',
        )
      }
    }
  }

  useEffect(() => {
    void load(range)
  }, [range])

  const maxBar = Math.max(1, ...(series?.points.map((p) => p.count) ?? [0]))
  const confirmed = overview?.accounts.confirmed ?? 0
  const activePct = overview
    ? pctOf(overview.activeUsers.count, confirmed)
    : null
  const updatedAt =
    overview?.updatedAt ??
    series?.updatedAt ??
    usage?.updatedAt ??
    null

  return (
      <div className={styles.overview} data-testid="admin-overview">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Przegląd</h1>
            <p className={styles.pageLead}>
              Kondycja platformy i rzeczywiste wykorzystanie OurWed.
            </p>
          </div>
          <div className={styles.rangeTabs} role="tablist" aria-label="Zakres">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={range === r.id}
                className={range === r.id ? styles.rangeActive : styles.rangeBtn}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        <p className={styles.freshness} data-testid="admin-freshness">
          {state === 'ready' ? formatUpdatedAt(updatedAt) : 'Pobieranie danych…'}
        </p>

        {state === 'loading' ? (
          <AdminStateMessage state="loading" />
        ) : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load(range)}
          >
            {errorMessage}
          </AdminStateMessage>
        ) : null}

        {state === 'ready' && overview ? (
          <>
            <section className={styles.metricRow} aria-label="Metryki główne">
              <article className={styles.metricCard}>
                <h2>Konta</h2>
                <p className={styles.metricValue}>{overview.accounts.total}</p>
                <p className={styles.metricSub}>
                  Nowe w zakresie: {overview.accounts.createdInRange}
                </p>
              </article>
              <article className={styles.metricCard}>
                <h2>
                  Aktywni użytkownicy
                  <span
                    className={styles.infoTip}
                    title={overview.activeUsers.definition}
                  >
                    i
                  </span>
                </h2>
                <p className={styles.metricValue}>{overview.activeUsers.count}</p>
                <p className={styles.metricSub}>
                  {activePct
                    ? `${activePct} potwierdzonych kont`
                    : 'Brak mianownika potwierdzonych kont'}
                </p>
                <p className={styles.metricDef}>
                  last_sign_in_at w wybranym zakresie (nie DAU/MAU)
                </p>
              </article>
              <article className={styles.metricCard}>
                <h2>Śluby</h2>
                <p className={styles.metricValue}>{overview.weddings.total}</p>
                <p className={styles.metricSub}>
                  Nadchodzące: {overview.weddings.upcoming} · Nowe:{' '}
                  {overview.weddings.createdInRange}
                </p>
              </article>
              <article className={styles.metricCard}>
                <h2>Sesje</h2>
                <p className={styles.metricValue}>{overview.sessions.total}</p>
                <p className={styles.metricSub}>
                  Nadchodzące: {overview.sessions.upcoming} · Nowe:{' '}
                  {overview.sessions.createdInRange}
                </p>
              </article>
            </section>

            <section className={styles.row65_35}>
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Aktywność rejestracji</h2>
                <p className={styles.metricDef}>
                  Strefa czasowa: Europe/Warsaw · źródło: auth.users.created_at
                </p>
                {!series || series.points.length === 0 ? (
                  <AdminStateMessage state="unavailable">
                    Brak danych historycznych
                  </AdminStateMessage>
                ) : (
                  <div className={styles.chart} data-testid="admin-reg-chart">
                    {series.points.map((p) => (
                      <div
                        key={p.date}
                        className={styles.chartBar}
                        title={`${p.date}: ${p.count}`}
                      >
                        <div
                          className={styles.chartFill}
                          style={{
                            height: `${Math.max(2, (p.count / maxBar) * 100)}%`,
                          }}
                        />
                        <span className={styles.chartLabel}>
                          {p.date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Wymaga uwagi</h2>
                {!attention || attention.items.length === 0 ? (
                  <p className={styles.emptyOk}>Brak wykrytych problemów.</p>
                ) : (
                  <ul className={styles.attentionList}>
                    {attention.items.map((item) => (
                      <li key={item.id}>
                        <Link to={item.href}>
                          <strong>{item.count}</strong> {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            <section className={styles.row60_40}>
              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Wykorzystanie produktu</h2>
                {usage ? (
                  <ul className={styles.usageList}>
                    <li>
                      <span>Wysłane ankiety do umowy</span>
                      <MetricValue value={usage.formQuestionnairesIssued} />
                    </li>
                    <li>
                      <span>Wypełnione ankiety do umowy</span>
                      <MetricValue value={usage.formQuestionnairesSubmitted} />
                    </li>
                    <li>
                      <span>Wysłane ankiety przedślubne</span>
                      <MetricValue value={usage.preweddingSent} />
                    </li>
                    <li>
                      <span>Wypełnione ankiety przedślubne</span>
                      <MetricValue value={usage.preweddingSubmitted} />
                    </li>
                    <li>
                      <span>Wygenerowane dokumenty</span>
                      <MetricValue value={usage.documentsGenerated} />
                    </li>
                    <li>
                      <span>Dokumenty oznaczone jako podpisane</span>
                      <MetricValue value={usage.documentsSigned} />
                    </li>
                    <li>
                      <span>Zarejestrowane wpłaty</span>
                      <MetricValue value={usage.paymentsRecorded} />
                    </li>
                    <li>
                      <span>Pobrane briefy</span>
                      <MetricValue
                        value={usage.briefsDownloaded}
                        unavailable={usage.briefsDownloadedStatus === 'unavailable'}
                      />
                    </li>
                    <li>
                      <span>Aktywne Google Calendar</span>
                      <MetricValue value={usage.googleCalendarActive} />
                    </li>
                    <li>
                      <span>Aktywne Apple Calendar</span>
                      <MetricValue value={usage.appleCalendarActive} />
                    </li>
                  </ul>
                ) : null}
              </article>

              <article className={styles.panelCard}>
                <h2 className={styles.sans}>Status systemu</h2>
                {system ? (
                  <ul className={styles.usageList}>
                    {system.checks
                      .filter((c) => c.id !== 'uptime')
                      .map((c) => (
                        <li key={c.id}>
                          <span>{c.label}</span>
                          <strong>{statusLabel(c.status)}</strong>
                        </li>
                      ))}
                    <li>
                      <span>Uptime</span>
                      <span className={styles.metricUnavailable}>
                        Nie można potwierdzić stanu
                      </span>
                    </li>
                  </ul>
                ) : null}
                <p className={styles.metricDef}>
                  Sprawdzono: {system?.checkedAt ? formatUpdatedAt(system.checkedAt).replace('Dane zaktualizowane: ', '') : '—'}
                </p>
              </article>
            </section>

            <section className={styles.panelCard}>
              <h2 className={styles.sans}>Lejek aktywacji</h2>
              <p className={styles.metricDef}>
                {funnel?.note ??
                  'Bezwzględne wielkości kohort — bez twierdzenia o konwersji chronologicznej.'}
              </p>
              {funnel ? (
                <ul className={styles.funnelList}>
                  {funnel.steps.map((step) => {
                    const base = funnel.steps[0]?.count ?? 0
                    const pct = pctOf(step.count, base)
                    return (
                      <li key={step.id}>
                        <div>
                          <strong>{step.label}</strong>
                          <span className={styles.metricDef}>{step.definition}</span>
                        </div>
                        <div className={styles.funnelNums}>
                          <span>{step.count}</span>
                          <span>{pct ?? '—'}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
  )
}

function statusLabel(status: string): string {
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

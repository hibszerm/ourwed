/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AdminApiRequestError,
  extendTrialAdmin,
  fetchUserSubscription,
  fetchUserSummary,
  grantManualProAdmin,
  revokeManualAccessAdmin,
} from '@/admin/api/adminApi'
import type {
  AdminUserSubscriptionDetail,
  AdminUserSummary,
} from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import {
  adminDisplayName,
  adminOptionalText,
} from '@/admin/lib/adminIdentityDisplay'
import {
  adminSubscriptionBadge,
  formatWarsawDate,
  type AccountEntitlement,
} from '@/lib/billing/entitlement'
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

function sourceLabel(source: AccountEntitlement['source']): string {
  switch (source) {
    case 'trial':
      return 'Trial'
    case 'paid_subscription':
      return 'Subskrypcja'
    case 'admin_override':
      return 'Ręczny dostęp'
    default:
      return 'Brak'
  }
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

function computeTrialExtensionEnd(
  entitlement: AccountEntitlement,
  days: number,
): string {
  const now = Date.now()
  const oldEnd = entitlement.trialEndsAt
    ? new Date(entitlement.trialEndsAt).getTime()
    : now
  const base = Math.max(oldEnd, now)
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
}

type ConfirmKind =
  | { kind: 'extend_days'; days: 7 | 14 | 30 }
  | { kind: 'extend_until'; until: string }
  | { kind: 'grant_until'; until: string }
  | { kind: 'grant_indefinite' }
  | { kind: 'revoke' }

function ConfirmModal({
  title,
  children,
  busy,
  confirmDisabled,
  onCancel,
  onConfirm,
}: {
  title: string
  children: ReactNode
  busy: boolean
  confirmDisabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className={styles.modalOverlay} role="presentation">
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-sub-confirm-title"
      >
        <h3 id="admin-sub-confirm-title" className={styles.sans}>
          {title}
        </h3>
        <div className={styles.modalBody}>{children}</div>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={busy}
            onClick={onCancel}
          >
            Anuluj
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            style={{ width: 'auto' }}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy ? 'Zapisywanie…' : 'Potwierdź'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminUserDetailPage() {
  const { userId = '' } = useParams()
  const [data, setData] = useState<AdminUserSummary | null>(null)
  const [subscription, setSubscription] =
    useState<AdminUserSubscriptionDetail | null>(null)
  const [subState, setSubState] = useState<
    'loading' | 'ready' | 'error' | 'forbidden'
  >('loading')
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [subError, setSubError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [reason, setReason] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [grantUntil, setGrantUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function loadSubscription() {
    setSubState('loading')
    setSubError(null)
    try {
      const detail = await fetchUserSubscription(userId)
      setSubscription(detail)
      setSubState('ready')
    } catch (err) {
      if (err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed') {
        setSubState('forbidden')
      } else {
        setSubState('error')
      }
      setSubError(
        err instanceof AdminApiRequestError
          ? err.message
          : 'Nie udało się pobrać subskrypcji',
      )
    }
  }

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
      void loadSubscription()
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

  function openConfirm(next: ConfirmKind) {
    setActionError(null)
    setReason('')
    setConfirm(next)
  }

  async function runMutation() {
    if (!confirm || !subscription) return
    setBusy(true)
    setActionError(null)
    try {
      if (confirm.kind === 'extend_days') {
        await extendTrialAdmin({
          userId,
          days: confirm.days,
          reason: reason.trim() || null,
        })
      } else if (confirm.kind === 'extend_until') {
        await extendTrialAdmin({
          userId,
          until: confirm.until,
          reason: reason.trim() || null,
        })
      } else if (confirm.kind === 'grant_until') {
        await grantManualProAdmin({
          userId,
          until: confirm.until,
          indefinite: false,
          reason: reason.trim() || null,
        })
      } else if (confirm.kind === 'grant_indefinite') {
        await grantManualProAdmin({
          userId,
          indefinite: true,
          reason: reason.trim() || null,
        })
      } else if (confirm.kind === 'revoke') {
        await revokeManualAccessAdmin({
          userId,
          reason: reason.trim() || null,
        })
      }
      setConfirm(null)
      await loadSubscription()
    } catch (err) {
      setActionError(
        err instanceof AdminApiRequestError
          ? err.message
          : 'Nie udało się zapisać zmiany',
      )
    } finally {
      setBusy(false)
    }
  }

  const entitlement = subscription?.entitlement ?? null
  const currentEnd = entitlement ? accessEndLabel(entitlement) : '—'

  let previewNewEnd = '—'
  let confirmTitle = 'Potwierdź'
  let confirmDisabled = false
  if (confirm?.kind === 'extend_days' && entitlement) {
    confirmTitle = `Przedłuż Trial o ${confirm.days} dni`
    previewNewEnd = formatWarsawDate(
      computeTrialExtensionEnd(entitlement, confirm.days),
    )
  } else if (confirm?.kind === 'extend_until') {
    confirmTitle = 'Przedłuż Trial do daty'
    previewNewEnd = formatWarsawDate(confirm.until)
  } else if (confirm?.kind === 'grant_until') {
    confirmTitle = 'Przyznaj PRO do daty'
    previewNewEnd = formatWarsawDate(confirm.until)
  } else if (confirm?.kind === 'grant_indefinite') {
    confirmTitle = 'Przyznaj PRO bezterminowo'
    previewNewEnd = 'Bezterminowo'
    confirmDisabled = reason.trim().length === 0
  } else if (confirm?.kind === 'revoke') {
    confirmTitle = 'Cofnij ręczny dostęp'
    previewNewEnd = 'Brak ręcznego dostępu'
  }

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

              <article className={styles.panelCard} style={{ gridColumn: '1 / -1' }}>
                <h2 className={styles.sans}>Subskrypcja i dostęp</h2>
                {subState === 'loading' ? (
                  <AdminStateMessage state="loading" />
                ) : null}
                {subState === 'error' || subState === 'forbidden' ? (
                  <AdminStateMessage
                    state={subState === 'forbidden' ? 'forbidden' : 'error'}
                    onRetry={() => void loadSubscription()}
                  >
                    {subError}
                  </AdminStateMessage>
                ) : null}
                {subState === 'ready' && entitlement && subscription ? (
                  <>
                    <ul className={styles.usageList}>
                      <li>
                        <span>Status</span>
                        <strong>{adminSubscriptionBadge(entitlement)}</strong>
                      </li>
                      <li>
                        <span>Dostęp</span>
                        <strong>
                          {entitlement.accessLevel === 'pro' ? 'PRO' : 'Wygasł'}
                        </strong>
                      </li>
                      <li>
                        <span>Źródło</span>
                        <strong>{sourceLabel(entitlement.source)}</strong>
                      </li>
                      <li>
                        <span>Trial od</span>
                        <strong>
                          {formatWarsawDate(entitlement.trialStartedAt)}
                        </strong>
                      </li>
                      <li>
                        <span>Trial do</span>
                        <strong>{formatWarsawDate(entitlement.trialEndsAt)}</strong>
                      </li>
                      <li>
                        <span>Okres płatny od</span>
                        <strong>
                          {formatWarsawDate(entitlement.currentPeriodStartedAt)}
                        </strong>
                      </li>
                      <li>
                        <span>Okres płatny do</span>
                        <strong>
                          {formatWarsawDate(entitlement.currentPeriodEndsAt)}
                        </strong>
                      </li>
                      <li>
                        <span>Provider</span>
                        <strong>
                          {entitlement.provider ?? '—'}
                          {entitlement.providerStatus
                            ? ` · ${entitlement.providerStatus}`
                            : ''}
                        </strong>
                      </li>
                      <li>
                        <span>Ręczny dostęp</span>
                        <strong>
                          {entitlement.manualAccessIndefinite
                            ? 'Bezterminowo'
                            : formatWarsawDate(entitlement.manualAccessUntil)}
                        </strong>
                      </li>
                      <li>
                        <span>Koniec dostępu</span>
                        <strong>{accessEndLabel(entitlement)}</strong>
                      </li>
                    </ul>

                    <p className={styles.quietNote}>
                      Płatności online: Niepodłączone
                    </p>

                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => openConfirm({ kind: 'extend_days', days: 7 })}
                      >
                        Trial +7
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => openConfirm({ kind: 'extend_days', days: 14 })}
                      >
                        Trial +14
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => openConfirm({ kind: 'extend_days', days: 30 })}
                      >
                        Trial +30
                      </button>
                    </div>

                    <div className={styles.actionRow}>
                      <input
                        className={styles.toolbarInput}
                        type="date"
                        value={customUntil}
                        onChange={(e) => setCustomUntil(e.target.value)}
                        aria-label="Data końca trial"
                      />
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={!customUntil}
                        onClick={() => {
                          if (!customUntil) return
                          openConfirm({
                            kind: 'extend_until',
                            until: new Date(`${customUntil}T23:59:59`).toISOString(),
                          })
                        }}
                      >
                        Przedłuż Trial do daty
                      </button>
                    </div>

                    <div className={styles.actionRow}>
                      <input
                        className={styles.toolbarInput}
                        type="date"
                        value={grantUntil}
                        onChange={(e) => setGrantUntil(e.target.value)}
                        aria-label="Data końca PRO"
                      />
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={!grantUntil}
                        onClick={() => {
                          if (!grantUntil) return
                          openConfirm({
                            kind: 'grant_until',
                            until: new Date(`${grantUntil}T23:59:59`).toISOString(),
                          })
                        }}
                      >
                        Przyznaj PRO do daty
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => openConfirm({ kind: 'grant_indefinite' })}
                      >
                        Przyznaj PRO bezterminowo
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => openConfirm({ kind: 'revoke' })}
                        disabled={
                          !(
                            entitlement.manualAccessIndefinite ||
                            entitlement.manualAccessUntil
                          )
                        }
                      >
                        Cofnij ręczny dostęp
                      </button>
                    </div>
                  </>
                ) : null}
              </article>
            </section>
          </>
        ) : null}

        {confirm ? (
          <ConfirmModal
            title={confirmTitle}
            busy={busy}
            confirmDisabled={confirmDisabled}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void runMutation()}
          >
            <p>
              Obecny koniec dostępu: <strong>{currentEnd}</strong>
              <br />
              Nowy koniec: <strong>{previewNewEnd}</strong>
            </p>
            <div className={styles.field} style={{ marginTop: '0.85rem' }}>
              <label htmlFor="admin-sub-reason">
                Powód
                {confirm.kind === 'grant_indefinite' ? ' (wymagany)' : ' (opcjonalny)'}
              </label>
              <input
                id="admin-sub-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoComplete="off"
              />
            </div>
            {actionError ? <p className={styles.quietNote}>{actionError}</p> : null}
          </ConfirmModal>
        ) : null}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconArrowLeft, IconMapPin } from '@/components/icons'
import { useToast } from '@/components/ui/Toast'
import { useSession } from '@/features/sessions/hooks/useSession'
import { useDeleteSession } from '@/features/sessions/hooks/useDeleteSession'
import { SessionPaymentModal } from '@/features/sessions/actions/SessionPaymentModal'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { buildSessionCommercialSummary } from '@/features/sessions/presentation/sessionFinance'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { EntityCalendarStatus } from '@/features/calendar-integrations'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import type { SessionPayment } from '@/types/sessionPayment'
import styles from './SessionDetailPage.module.css'

function countdownLabel(date: string): string | null {
  const days = getDaysUntil(date)
  if (days < 0) return null
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

export function SessionDetailPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const { data: session, isLoading, isError, error } = useSession(sessionId)
  const linkedId = session?.linkedWeddingId ?? ''
  const { data: linkedWedding } = useWedding(linkedId)
  const deleteSession = useDeleteSession()
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editedPayment, setEditedPayment] = useState<SessionPayment | null>(null)
  const [addAsDeposit, setAddAsDeposit] = useState(true)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <AppLayout title="Szczegóły sesji" subtitle="Ładowanie...">
        <PageContainer width="wide">
          <p>Ładowanie sesji…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !session) {
    return (
      <AppLayout title="Szczegóły sesji">
        <PageContainer width="wide">
          <EmptyState
            title="Nie znaleziono sesji"
            description={
              error instanceof Error ? error.message : 'Sesja nie istnieje.'
            }
          />
          <Link to="/sesje">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  const name = getSessionDisplayName(session)
  const finance = buildSessionCommercialSummary(
    session.totalPrice,
    session.depositAmount,
    session.payments,
  )
  const hasPaidDeposit = hasPaidDepositPayment(session.payments)
  const timeLabel = [session.startTime, session.endTime]
    .filter(Boolean)
    .join(' – ')
  const countdown = countdownLabel(session.date)
  const locationName = session.location?.name?.trim()
  const locationAddress =
    session.location?.formattedAddress?.trim() ||
    session.location?.address?.trim()
  const hasLocation = Boolean(locationName || locationAddress)

  async function handleDelete() {
    const current = session
    if (!current) return
    const allowed = requirePro()
    if (!allowed) return
    if (
      !window.confirm(
        `Usunąć sesję „${name}"? Tej operacji nie można cofnąć.`,
      )
    ) {
      return
    }
    try {
      await deleteSession.mutateAsync(current.id)
      showToast('Sesja została usunięta', 'success')
      navigate('/sesje')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć sesji',
        'error',
      )
    }
  }

  function openAddPayment() {
    if (!requirePro()) return
    setEditedPayment(null)
    setAddAsDeposit(!hasPaidDeposit)
    setPaymentModalOpen(true)
  }

  function openEditPayment(payment: SessionPayment) {
    if (!requirePro()) return
    setEditedPayment(payment)
    setPaymentModalOpen(true)
  }

  async function handleDeletePayment(payment: SessionPayment) {
    if (!requirePro()) return
    if (!window.confirm(`Usunąć wpłatę „${payment.label}”?`)) return
    setDeletingPaymentId(payment.id)
    try {
      await sessionPaymentService.delete(payment.id)
      await invalidateSessionFinanceQueries(queryClient, sessionId)
      showToast('Wpłata została usunięta', 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć wpłaty',
        'error',
      )
    } finally {
      setDeletingPaymentId(null)
    }
  }

  return (
    <AppLayout
      title={name}
      subtitle="Sesja"
      action={
        <Link to="/sesje">
          <Button variant="ghost" size="sm">
            <IconArrowLeft width={16} height={16} />
            Lista
          </Button>
        </Link>
      }
    >
      <PageContainer width="wide">
        <div className={styles.workspace}>
          <header className={styles.commandHeader}>
            <div className={styles.commandMain}>
              <div className={styles.commandIdentity}>
                <h1 className={styles.commandTitle}>{name}</h1>
                <p className={styles.commandMetaLine}>
                  <time>
                    {formatDate(session.date, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                  {countdown ? (
                    <>
                      <span aria-hidden> · </span>
                      <span>{countdown}</span>
                    </>
                  ) : null}
                  {timeLabel ? (
                    <>
                      <span aria-hidden> · </span>
                      <span>{timeLabel}</span>
                    </>
                  ) : null}
                </p>
                {hasLocation ? (
                  <p className={styles.commandVenueLine}>
                    <IconMapPin width={14} height={14} aria-hidden />
                    <span>
                      {[locationName, locationAddress]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </p>
                ) : null}
                <div className={styles.commandPills}>
                  <Badge variant="neutral">Sesja</Badge>
                  <span className={styles.statusPillMuted}>
                    {formatSessionType(session)}
                  </span>
                </div>
              </div>

              <div className={styles.commandActions}>
                <Link to={`/sesje/${session.id}/edytuj`}>
                  <Button type="button" variant="primary">
                    Edytuj sesję
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleDelete()}
                  disabled={deleteSession.isPending}
                >
                  Usuń
                </Button>
              </div>
            </div>
          </header>

          <section
            className={styles.overviewBand}
            aria-label="Podsumowanie finansów sesji"
          >
            <div className={styles.bandItem}>
              <span className={styles.bandLabel}>Cena</span>
              <p className={styles.bandValue}>
                {formatCurrency(finance.totalPrice)}
              </p>
            </div>
            <div className={styles.bandItem}>
              <span className={styles.bandLabel}>Ustalona zaliczka</span>
              <p className={styles.bandValue}>
                {formatCurrency(finance.agreedDeposit)}
              </p>
            </div>
            <div className={styles.bandItem}>
              <span className={styles.bandLabel}>Wpłacono</span>
              <p className={styles.bandValue}>
                {formatCurrency(finance.totalPaid)}
              </p>
            </div>
            <div className={styles.bandItem}>
              <span className={styles.bandLabel}>Pozostało</span>
              <p className={styles.bandValue}>
                {formatCurrency(finance.remaining)}
              </p>
            </div>
          </section>

          <div className={styles.content}>
            <section className={styles.surfaceSection} aria-labelledby="info-title">
              <h2 id="info-title" className={styles.sectionHeading}>
                Informacje o sesji
              </h2>
              <dl className={styles.editorialKv}>
                <div>
                  <dt>Nazwa</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>Rodzaj</dt>
                  <dd>{formatSessionType(session)}</dd>
                </div>
                <div>
                  <dt>Osoba 1</dt>
                  <dd>
                    {[
                      session.primaryPerson.firstName,
                      session.primaryPerson.lastName,
                    ]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Osoba 2</dt>
                  <dd>
                    {[
                      session.secondaryPerson?.firstName,
                      session.secondaryPerson?.lastName,
                    ]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.surfaceSection} aria-labelledby="loc-title">
              <h2 id="loc-title" className={styles.sectionHeading}>
                Lokalizacja
              </h2>
              {hasLocation ? (
                <div className={styles.location}>
                  <IconMapPin className={styles.pin} aria-hidden />
                  <div>
                    {locationName ? (
                      <p className={styles.placeName}>{locationName}</p>
                    ) : null}
                    <p className={styles.placeAddress}>
                      {locationAddress || '—'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className={styles.muted}>Brak lokalizacji</p>
              )}
            </section>

            <section className={styles.surfaceSection} aria-labelledby="fin-title">
              <div className={styles.sectionHeadingRow}>
                <h2 id="fin-title" className={styles.sectionHeading}>
                  Finanse
                </h2>
                <Button type="button" size="sm" onClick={openAddPayment}>
                  {hasPaidDeposit ? 'Dodaj wpłatę' : 'Dodaj zaliczkę'}
                </Button>
              </div>
              <div className={styles.financeGrid}>
                <div>
                  <span className={styles.finLabel}>Cena</span>
                  <span className={styles.finValue}>
                    {formatCurrency(finance.totalPrice)}
                  </span>
                </div>
                <div>
                  <span className={styles.finLabel}>Ustalona zaliczka</span>
                  <span className={styles.finValue}>
                    {formatCurrency(finance.agreedDeposit)}
                  </span>
                </div>
                <div>
                  <span className={styles.finLabel}>Wpłacono</span>
                  <span className={styles.finValue}>
                    {formatCurrency(finance.totalPaid)}
                  </span>
                </div>
                <div>
                  <span className={styles.finLabel}>Pozostało</span>
                  <span className={styles.finValue}>
                    {formatCurrency(finance.remaining)}
                  </span>
                </div>
              </div>
              {session.payments.length > 0 ? (
                <ul className={styles.paymentList}>
                  {session.payments.map((payment) => (
                    <li key={payment.id} className={styles.paymentItem}>
                      <div className={styles.paymentMain}>
                        <span className={styles.paymentLabel}>
                          {payment.label}
                        </span>
                        <span className={styles.paymentMeta}>
                          {payment.paid
                            ? `Wpłacono ${formatDate(payment.paidAt ?? payment.createdAt, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}`
                            : 'Nieopłacona'}
                          {payment.method ? ` · ${payment.method}` : ''}
                          {payment.note ? ` · ${payment.note}` : ''}
                        </span>
                      </div>
                      <strong className={styles.paymentAmount}>
                        {formatCurrency(payment.amount)}
                      </strong>
                      <div className={styles.paymentActions}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditPayment(payment)}
                        >
                          Edytuj
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deletingPaymentId === payment.id}
                          onClick={() => void handleDeletePayment(payment)}
                        >
                          Usuń
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.paymentEmpty}>Brak zarejestrowanych wpłat.</p>
              )}
            </section>

            <section
              className={styles.surfaceSection}
              aria-labelledby="link-title"
            >
              <h2 id="link-title" className={styles.sectionHeading}>
                Powiązany ślub
              </h2>
              {session.linkedWeddingId && linkedWedding ? (
                <div className={styles.linked}>
                  <div>
                    <p className={styles.placeName}>
                      {getWeddingDisplayName(linkedWedding)}
                    </p>
                    <p className={styles.muted}>
                      {formatDate(linkedWedding.date, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Link to={`/sluby/${linkedWedding.id}`}>
                    <Button variant="secondary" size="sm">
                      Otwórz ślub
                    </Button>
                  </Link>
                </div>
              ) : session.linkedWeddingId && !linkedWedding ? (
                <p className={styles.muted}>
                  Powiązany ślub jest niedostępny. Możesz usunąć powiązanie w
                  edycji.
                </p>
              ) : (
                <div className={styles.linkedEmpty}>
                  <p className={styles.muted}>Brak powiązanego ślubu</p>
                  <Link to={`/sesje/${session.id}/edytuj`}>
                    <Button variant="secondary" size="sm">
                      Dodaj powiązanie
                    </Button>
                  </Link>
                </div>
              )}
            </section>

            <section className={styles.surfaceSection}>
              <EntityCalendarStatus
                entityType="session"
                entityId={session.id}
                compact={false}
              />
            </section>

            <section
              className={styles.surfaceSection}
              aria-labelledby="notes-title"
            >
              <h2 id="notes-title" className={styles.sectionHeading}>
                Notatki
              </h2>
              {session.notes?.trim() ? (
                <p className={styles.notes}>{session.notes}</p>
              ) : (
                <p className={styles.muted}>Brak notatek</p>
              )}
            </section>
          </div>
          {paymentModalOpen ? (
            <SessionPaymentModal
              key={
                editedPayment?.id ??
                `new-${addAsDeposit ? 'deposit' : 'payment'}`
              }
              open
              onClose={() => setPaymentModalOpen(false)}
              sessionId={session.id}
              payment={editedPayment}
              defaultType={
                editedPayment
                  ? editedPayment.type
                  : addAsDeposit
                    ? 'deposit'
                    : 'installment'
              }
              suggestedAmount={
                addAsDeposit && !editedPayment
                  ? session.depositAmount
                  : undefined
              }
            />
          ) : null}
        </div>
      </PageContainer>
    </AppLayout>
  )
}

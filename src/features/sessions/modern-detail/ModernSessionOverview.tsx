import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { EntityCalendarStatus } from '@/features/calendar-integrations'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { formatSessionPersonLine } from '@/features/sessions/modern-detail/sessionDetailPresentation'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { SessionCommercialSummary } from '@/features/sessions/presentation/sessionFinance'
import type { Session } from '@/types/session'
import type { SessionPayment } from '@/types/sessionPayment'
import type { Wedding } from '@/types/wedding'
import styles from './ModernSessionOverview.module.css'

interface Props {
  session: Session
  finance: SessionCommercialSummary
  hasPaidDeposit: boolean
  linkedWedding: Wedding | null | undefined
  deletingPaymentId: string | null
  onAddPayment: () => void
  onEditPayment: (payment: SessionPayment) => void
  onDeletePayment: (payment: SessionPayment) => void
}

export function ModernSessionOverview({
  session,
  finance,
  hasPaidDeposit,
  linkedWedding,
  deletingPaymentId,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
}: Props) {
  const locationName = session.location?.name?.trim()
  const locationAddress =
    session.location?.formattedAddress?.trim() ||
    session.location?.address?.trim()
  const hasLocation = Boolean(locationName || locationAddress)

  return (
    <div className={styles.stack} data-testid="modern-session-overview">
      <section
        className={styles.box}
        aria-labelledby="modern-session-finance-title"
        data-testid="modern-session-finance"
      >
        <div className={styles.sectionHeadingRow}>
          <h2 id="modern-session-finance-title" className={styles.sectionTitle}>
            Finanse
          </h2>
          <Button type="button" size="sm" onClick={onAddPayment}>
            {hasPaidDeposit ? 'Dodaj wpłatę' : 'Dodaj zaliczkę'}
          </Button>
        </div>
        <div className={styles.financeFacts}>
          <div className={styles.fact}>
            <p className={styles.factLabel}>Wartość</p>
            <p className={`${styles.factValue} ${styles.financeTotal}`}>
              {formatCurrency(finance.totalPrice)}
            </p>
          </div>
          <div className={styles.fact}>
            <p className={styles.factLabel}>Ustalona zaliczka</p>
            <p className={styles.factValue}>
              {formatCurrency(finance.agreedDeposit)}
            </p>
          </div>
          <div className={styles.fact}>
            <p className={styles.factLabel}>Wpłacono</p>
            <p className={styles.factValue}>
              {formatCurrency(finance.totalPaid)}
            </p>
          </div>
          <div className={styles.fact}>
            <p className={styles.factLabel}>Pozostało</p>
            <p className={styles.factValue}>
              {formatCurrency(finance.remaining)}
            </p>
          </div>
        </div>
        {session.payments.length > 0 ? (
          <ul className={styles.paymentList}>
            {session.payments.map((payment) => (
              <li key={payment.id} className={styles.paymentItem}>
                <div className={styles.paymentMain}>
                  <span className={styles.paymentLabel}>{payment.label}</span>
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
                    onClick={() => onEditPayment(payment)}
                  >
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deletingPaymentId === payment.id}
                    onClick={() => onDeletePayment(payment)}
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
        className={styles.box}
        aria-labelledby="modern-session-info-title"
        data-testid="modern-session-info"
      >
        <h2 id="modern-session-info-title" className={styles.sectionTitle}>
          Informacje
        </h2>
        <dl className={styles.kv}>
          <div>
            <dt>Rodzaj</dt>
            <dd>{formatSessionType(session)}</dd>
          </div>
          <div>
            <dt>Osoba 1</dt>
            <dd>{formatSessionPersonLine(session.primaryPerson)}</dd>
          </div>
          <div>
            <dt>Osoba 2</dt>
            <dd>{formatSessionPersonLine(session.secondaryPerson)}</dd>
          </div>
        </dl>
      </section>

      <section
        className={styles.box}
        aria-labelledby="modern-session-location-title"
        data-testid="modern-session-location"
      >
        <h2 id="modern-session-location-title" className={styles.sectionTitle}>
          Lokalizacja
        </h2>
        {hasLocation ? (
          <>
            {locationName ? (
              <p className={styles.placeName}>{locationName}</p>
            ) : null}
            <p className={styles.placeAddress}>{locationAddress || '—'}</p>
          </>
        ) : (
          <p className={styles.muted}>Brak lokalizacji</p>
        )}
      </section>

      <section
        className={styles.box}
        aria-labelledby="modern-session-link-title"
        data-testid="modern-session-linked-wedding"
      >
        <h2 id="modern-session-link-title" className={styles.sectionTitle}>
          Powiązany ślub
        </h2>
        {session.linkedWeddingId && linkedWedding ? (
          <div className={styles.linked}>
            <div className={styles.linkedMain}>
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
            <Link
              to={`/sluby/${linkedWedding.id}`}
              className={styles.linkedAction}
            >
              <Button variant="secondary" size="sm">
                Otwórz ślub
              </Button>
            </Link>
          </div>
        ) : session.linkedWeddingId && !linkedWedding ? (
          <p className={styles.muted}>
            Powiązany ślub jest niedostępny. Możesz usunąć powiązanie w edycji.
          </p>
        ) : (
          <div className={styles.linked}>
            <p className={styles.muted}>Brak powiązanego ślubu</p>
            <Link
              to={`/sesje/${session.id}/edytuj`}
              className={styles.linkedAction}
            >
              <Button variant="secondary" size="sm">
                Dodaj powiązanie
              </Button>
            </Link>
          </div>
        )}
      </section>

      <section
        className={styles.box}
        data-testid="modern-session-calendar"
      >
        <EntityCalendarStatus
          entityType="session"
          entityId={session.id}
          compact={false}
        />
      </section>

      <section
        className={styles.box}
        aria-labelledby="modern-session-notes-title"
        data-testid="modern-session-notes"
      >
        <h2 id="modern-session-notes-title" className={styles.sectionTitle}>
          Notatki
        </h2>
        {session.notes?.trim() ? (
          <p className={styles.notes}>{session.notes}</p>
        ) : (
          <p className={styles.muted}>Brak notatek</p>
        )}
      </section>
    </div>
  )
}

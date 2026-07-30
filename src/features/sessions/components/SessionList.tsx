import { Link } from 'react-router-dom'
import { IconChevronRight } from '@/components/icons'
import { formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { getSessionRemainingAmount } from '@/features/sessions/presentation/getSessionRemainingAmount'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import type { Session } from '@/types/session'
import styles from './SessionList.module.css'

function SessionListRow({ session }: { session: Session }) {
  const name = getSessionDisplayName(session)
  const location = getSessionLocationSummary(session.location)
  const typeLabel = formatSessionType(session)
  const remaining = getSessionRemainingAmount(
    session.totalPrice,
    session.depositAmount,
  )
  const dateLabel = formatDate(session.date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <li className={styles.item}>
      <Link
        to={`/sesje/${session.id}`}
        className={styles.row}
        aria-label={`Otwórz sesję: ${name}`}
      >
        <time className={styles.date} dateTime={session.date}>
          {dateLabel}
        </time>
        <span className={styles.name} title={name}>
          {name}
        </span>
        <span className={styles.type}>{typeLabel}</span>
        <span
          className={location ? styles.venue : styles.venueEmpty}
          title={location || undefined}
        >
          {location || '—'}
        </span>
        <span className={styles.price}>{formatCurrency(session.totalPrice)}</span>
        <span className={styles.remainingWrap}>
          <span className={styles.remainingLabel}>Pozostało</span>
          <span className={styles.remaining}>{formatCurrency(remaining)}</span>
        </span>
        <IconChevronRight className={styles.chevron} aria-hidden />
      </Link>
    </li>
  )
}

/** Desktop order: date | name | type | location | price | remaining | chevron */
export function SessionList({ sessions }: { sessions: Session[] }) {
  return (
    <ul className={styles.list} data-testid="sessions-list">
      {sessions.map((session) => (
        <SessionListRow key={session.id} session={session} />
      ))}
    </ul>
  )
}

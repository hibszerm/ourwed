import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { IconChevronRight, IconMapPin } from '@/components/icons'
import { formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { getSessionRemainingAmount } from '@/features/sessions/presentation/getSessionRemainingAmount'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import type { Session } from '@/types/session'
import styles from './SessionCard.module.css'

export function SessionCard({ session }: { session: Session }) {
  const name = getSessionDisplayName(session)
  const location = getSessionLocationSummary(session.location)
  const remaining = getSessionRemainingAmount(
    session.totalPrice,
    session.payments,
  )

  return (
    <Link to={`/sesje/${session.id}`} className={styles.link}>
      <Card hover className={styles.card}>
        <div className={styles.top}>
          <time className={styles.date} dateTime={session.date}>
            {formatDate(session.date, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </time>
          <span className={styles.type}>{formatSessionType(session)}</span>
        </div>
        <h3 className={styles.name}>{name}</h3>
        {location ? (
          <div className={styles.location}>
            <IconMapPin className={styles.icon} />
            <span title={location}>{location}</span>
          </div>
        ) : null}
        <div className={styles.finance}>
          <div>
            <span className={styles.label}>Cena</span>
            <span className={styles.value}>{formatCurrency(session.totalPrice)}</span>
          </div>
          <div>
            <span className={styles.label}>Pozostało</span>
            <span className={styles.value}>{formatCurrency(remaining)}</span>
          </div>
          <IconChevronRight className={styles.chevron} aria-hidden />
        </div>
      </Card>
    </Link>
  )
}

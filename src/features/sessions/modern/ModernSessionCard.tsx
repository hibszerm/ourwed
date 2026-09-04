import { Link } from 'react-router-dom'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { ModernWeddingsDate } from '@/features/weddings/modern/ModernWeddingsDate'
import {
  getEditorialDateParts,
  getModernSessionValueLabel,
} from '@/features/sessions/modern/modernSessionsModel'
import type { Session } from '@/types/session'
import styles from './ModernSessionCard.module.css'

interface ModernSessionCardProps {
  session: Session
}

export function ModernSessionCard({ session }: ModernSessionCardProps) {
  const name = getSessionDisplayName(session)
  const location = getSessionLocationSummary(session.location)
  const typeLabel = formatSessionType(session)
  const value = getModernSessionValueLabel(session)
  const dateParts = getEditorialDateParts(session.date)

  return (
    <Link
      to={`/sesje/${session.id}`}
      className={`${styles.card} v3MaterialSecondaryCard`}
      aria-label={`Otwórz sesję: ${name}`}
    >
      {dateParts ? (
        <ModernWeddingsDate
          parts={dateParts}
          weekday
          size="card"
        />
      ) : null}

      <div className={styles.body}>
        <div className={styles.couple}>
          <h3 className={styles.name}>{name}</h3>
        </div>
        <div className={styles.locationSlot}>
          {location ? <p className={styles.location}>{location}</p> : null}
        </div>
        <div className={styles.packageSlot}>
          {typeLabel ? <p className={styles.package}>{typeLabel}</p> : null}
        </div>
        <div className={styles.value}>
          {value ? (
            <>
              <span className={styles.valueLabel}>Wartość</span>
              <span className={styles.valueAmount}>{value}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

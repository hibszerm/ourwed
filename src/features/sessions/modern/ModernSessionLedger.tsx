import { Link } from 'react-router-dom'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
  getModernSessionValueLabel,
} from '@/features/sessions/modern/modernSessionsModel'
import type { Session } from '@/types/session'
import styles from './ModernSessionLedger.module.css'

interface ModernSessionLedgerProps {
  sessions: Session[]
}

function supportingLine(
  location: string | null,
  typeLabel: string | null,
): string | null {
  if (location && typeLabel) return `${location}  ·  ${typeLabel}`
  return location || typeLabel
}

function LedgerDate({ date }: { date: string }) {
  const parts = getEditorialDateParts(date)
  if (!parts) return null
  const month = parts.month.replace(/\./g, '').trim()
  const year = parts.dateTime.slice(0, 4)
  return (
    <time
      className={styles.date}
      dateTime={parts.dateTime}
      aria-label={formatLedgerFullDate(parts)}
    >
      <span className={styles.dateDay}>{parts.day}</span>
      <span className={styles.dateMonth}>{month}</span>
      <span className={styles.dateYear}>{year}</span>
    </time>
  )
}

function ModernSessionLedgerRow({ session }: { session: Session }) {
  const name = getSessionDisplayName(session)
  const location = getSessionLocationSummary(session.location)
  const typeLabel = formatSessionType(session)
  const value = getModernSessionValueLabel(session)
  const meta = supportingLine(location, typeLabel)

  return (
    <li className={styles.item}>
      <Link
        to={`/sesje/${session.id}`}
        className={styles.row}
        aria-label={`Otwórz sesję: ${name}`}
      >
        <div className={styles.dateCol}>
          <LedgerDate date={session.date} />
        </div>

        <div className={styles.booking}>
          <span className={styles.name}>{name}</span>
          {meta ? <span className={styles.meta}>{meta}</span> : null}
        </div>

        {value ? (
          <span className={styles.value}>{value}</span>
        ) : (
          <span className={styles.valueEmpty} />
        )}
      </Link>
    </li>
  )
}

export function ModernSessionLedger({ sessions }: ModernSessionLedgerProps) {
  return (
    <ul className={styles.list} data-testid="modern-sessions-list">
      {sessions.map((session) => (
        <ModernSessionLedgerRow key={session.id} session={session} />
      ))}
    </ul>
  )
}

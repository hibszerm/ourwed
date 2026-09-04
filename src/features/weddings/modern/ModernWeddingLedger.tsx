import { Link } from 'react-router-dom'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
  getModernContractValueLabel,
  weddingStatusCue,
} from '@/features/weddings/modern/modernWeddingsModel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingLedger.module.css'

interface ModernWeddingLedgerProps {
  weddings: Wedding[]
}

function supportingLine(
  location: string | null,
  packageName: string | null,
): string | null {
  if (location && packageName) return `${location}  ·  ${packageName}`
  return location || packageName
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

function ModernWeddingLedgerRow({ wedding }: { wedding: Wedding }) {
  const name = getWeddingDisplayName(wedding)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText
  const packageName = wedding.packageName?.trim() || null
  const value = getModernContractValueLabel(wedding)
  const status = weddingStatusCue(wedding.status)
  const meta = supportingLine(location, packageName)

  return (
    <li className={styles.item}>
      <Link
        to={`/sluby/${wedding.id}`}
        className={styles.row}
        aria-label={`Otwórz ślub: ${name}`}
      >
        <div className={styles.dateCol}>
          <LedgerDate date={wedding.date} />
        </div>

        <div className={styles.booking}>
          <span className={styles.name}>{name}</span>
          {status ? <span className={styles.status}>{status}</span> : null}
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

export function ModernWeddingLedger({ weddings }: ModernWeddingLedgerProps) {
  return (
    <ul className={styles.list} data-testid="modern-weddings-list">
      {weddings.map((wedding) => (
        <ModernWeddingLedgerRow key={wedding.id} wedding={wedding} />
      ))}
    </ul>
  )
}

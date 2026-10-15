import { Link } from 'react-router-dom'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { SharedWeddingAttribution } from '@/features/weddings/modern/SharedWeddingAttribution'
import {
  getWorkspaceWeddingName,
  type WorkspaceWeddingDisplayItem,
} from '@/features/weddings/modern/workspaceWeddings'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
  getModernContractValueLabel,
  weddingStatusCue,
} from '@/features/weddings/modern/modernWeddingsModel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingLedger.module.css'

interface ModernWeddingLedgerProps {
  weddings: (WorkspaceWeddingDisplayItem | Wedding)[]
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

function SharedWeddingLedgerRow({
  wedding,
}: {
  wedding: Extract<WorkspaceWeddingDisplayItem, { ownershipKind: 'shared' }>
}) {
  const name = getWorkspaceWeddingName(wedding)
  return (
    <li className={styles.item} data-ownership-kind="shared">
      <div className={`${styles.row} ${styles.sharedRow}`}>
        <Link
          to={`/wspolpraca/sluby/${wedding.id}`}
          className={styles.sharedHitArea}
          aria-label={`Otwórz ślub współdzielony: ${name}`}
        >
          <span className={styles.srOnly}>Otwórz ślub współdzielony: {name}</span>
        </Link>
        <div className={styles.dateCol}>
          {wedding.date ? <LedgerDate date={wedding.date} /> : null}
        </div>
        <div className={`${styles.booking} ${styles.sharedBooking}`}>
          <div className={styles.sharedNameRow}>
            <span className={styles.name}>{name}</span>
            <SharedWeddingAttribution ownerDisplayName={wedding.ownerDisplayName} />
          </div>
        </div>
      </div>
    </li>
  )
}

export function ModernWeddingLedger({ weddings }: ModernWeddingLedgerProps) {
  return (
    <ul className={styles.list} data-testid="modern-weddings-list">
      {weddings.map((item) => {
        if ('ownershipKind' in item && item.ownershipKind === 'shared') {
          return <SharedWeddingLedgerRow key={item.id} wedding={item} />
        }
        const wedding = 'ownershipKind' in item ? item.wedding : item
        return <ModernWeddingLedgerRow key={wedding.id} wedding={wedding} />
      })}
    </ul>
  )
}

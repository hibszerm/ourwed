import { Link } from 'react-router-dom'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { ModernWeddingsDate } from '@/features/weddings/modern/ModernWeddingsDate'
import {
  getEditorialDateParts,
  getModernContractValueLabel,
  weddingStatusCue,
} from '@/features/weddings/modern/modernWeddingsModel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingCard.module.css'

interface ModernWeddingCardProps {
  wedding: Wedding
}

export function ModernWeddingCard({ wedding }: ModernWeddingCardProps) {
  const name = getWeddingDisplayName(wedding)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText
  const packageName = wedding.packageName?.trim() || null
  const value = getModernContractValueLabel(wedding)
  const dateParts = getEditorialDateParts(wedding.date)
  const status = weddingStatusCue(wedding.status)

  return (
    <Link
      to={`/sluby/${wedding.id}`}
      className={`${styles.card} v3MaterialSecondaryCard`}
      aria-label={`Otwórz ślub: ${name}`}
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
          {status ? <p className={styles.status}>{status}</p> : null}
        </div>
        <div className={styles.locationSlot}>
          {location ? <p className={styles.location}>{location}</p> : null}
        </div>
        <div className={styles.packageSlot}>
          {packageName ? <p className={styles.package}>{packageName}</p> : null}
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

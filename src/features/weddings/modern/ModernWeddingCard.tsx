import { Link } from 'react-router-dom'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { SharedWeddingAttribution } from '@/features/weddings/modern/SharedWeddingAttribution'
import {
  getWorkspaceWeddingName,
  type WorkspaceWeddingDisplayItem,
} from '@/features/weddings/modern/workspaceWeddings'
import { ModernWeddingsDate } from '@/features/weddings/modern/ModernWeddingsDate'
import {
  getEditorialDateParts,
  getModernContractValueLabel,
  weddingStatusCue,
} from '@/features/weddings/modern/modernWeddingsModel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingCard.module.css'

interface ModernWeddingCardProps {
  wedding: WorkspaceWeddingDisplayItem | Wedding
}

export function ModernWeddingCard({ wedding }: ModernWeddingCardProps) {
  if ('ownershipKind' in wedding && wedding.ownershipKind === 'shared') {
    const name = getWorkspaceWeddingName(wedding)
    const dateParts = wedding.date ? getEditorialDateParts(wedding.date) : null
    return (
      <article className={`${styles.card} ${styles.sharedCard} v3MaterialSecondaryCard`} data-ownership-kind="shared">
        <Link
          to={`/wspolpraca/sluby/${wedding.id}`}
          className={styles.sharedHitArea}
          aria-label={`Otwórz ślub współdzielony: ${name}`}
        >
          <span className={styles.srOnly}>Otwórz ślub współdzielony: {name}</span>
        </Link>
        <div className={styles.sharedVisual}>
          {dateParts ? (
            <ModernWeddingsDate parts={dateParts} weekday size="card" />
          ) : <span aria-hidden />}
          <div className={`${styles.body} ${styles.sharedBody}`}>
            <div className={`${styles.couple} ${styles.sharedCouple}`}>
              <h3 className={styles.name}>{name}</h3>
              <SharedWeddingAttribution ownerDisplayName={wedding.ownerDisplayName} />
            </div>
          </div>
        </div>
      </article>
    )
  }

  const ownedWedding = 'ownershipKind' in wedding ? wedding.wedding : wedding
  const name = getWeddingDisplayName(ownedWedding)
  const location = getWeddingPrimaryLocationSummary(ownedWedding).displayText
  const packageName = ownedWedding.packageName?.trim() || null
  const value = getModernContractValueLabel(ownedWedding)
  const dateParts = getEditorialDateParts(ownedWedding.date)
  const status = weddingStatusCue(ownedWedding.status)

  return (
    <Link
      to={`/sluby/${ownedWedding.id}`}
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

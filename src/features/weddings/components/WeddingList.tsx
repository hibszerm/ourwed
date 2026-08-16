import { Link } from 'react-router-dom'
import { IconChevronRight } from '@/components/icons'
import { formatDate } from '@/lib/utils/dates'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingList.module.css'

interface WeddingListProps {
  weddings: Wedding[]
}

function WeddingListRow({ wedding }: { wedding: Wedding }) {
  const name = getWeddingDisplayName(wedding)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText
  const commercial = getWeddingCommercialSummary(wedding)
  const dateLabel = formatDate(wedding.date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const remaining = formatCurrency(commercial.remainingToPay)
  const packageName = commercial.packageName?.trim() || '—'

  return (
    <li className={styles.item}>
      <Link
        to={`/sluby/${wedding.id}`}
        className={styles.row}
        aria-label={`Otwórz ślub: ${name}`}
      >
        <time className={styles.date} dateTime={wedding.date}>
          {dateLabel}
        </time>

        <span className={styles.name} title={name}>
          {name}
        </span>

        <span
          className={location ? styles.venue : styles.venueEmpty}
          title={location || undefined}
        >
          {location || '—'}
        </span>

        <span className={styles.package} title={packageName}>
          {packageName}
        </span>

        <span className={styles.remainingWrap}>
          <span className={styles.remainingLabel}>Pozostało</span>
          <span className={styles.remaining}>{remaining}</span>
        </span>

        <IconChevronRight className={styles.chevron} aria-hidden />
      </Link>
    </li>
  )
}

/** Compact scannable Wedding list — dedicated layout, not a compressed card grid. */
export function WeddingList({ weddings }: WeddingListProps) {
  return (
    <ul className={styles.list} data-testid="weddings-list">
      {weddings.map((wedding) => (
        <WeddingListRow key={wedding.id} wedding={wedding} />
      ))}
    </ul>
  )
}

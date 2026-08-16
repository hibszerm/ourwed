import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { IconChevronRight, IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingCard.module.css'

interface WeddingCardProps {
  wedding: Wedding
  onOpen?: (wedding: Wedding) => void
  disabled?: boolean
  shortNames?: boolean
}

export function WeddingCard({
  wedding,
  onOpen,
  disabled = false,
  shortNames = false,
}: WeddingCardProps) {
  const name = getWeddingDisplayName(wedding, { short: shortNames })
  const days = getDaysUntil(wedding.date)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText
  const commercial = getWeddingCommercialSummary(wedding)

  const body = (
    <Card hover={!disabled} className={`${styles.card} ${disabled ? styles.disabled : ''}`.trim()}>
      <div className={styles.header}>
        <Avatar name={wedding.couple.partner1} color={wedding.accentColor} size="lg" />
        <div className={styles.info}>
          <h3 className={styles.name}>{name}</h3>
          <p className={styles.package}>{commercial.packageName || '—'}</p>
        </div>
      </div>

      {location ? (
        <div className={styles.detail}>
          <IconMapPin className={styles.icon} />
          <span className={styles.detailText} title={location}>
            {location}
          </span>
        </div>
      ) : null}

      <div className={styles.commercial}>
        <div className={styles.commercialItem}>
          <span className={styles.commercialLabel}>Umowa</span>
          <span className={styles.commercialValue}>
            {formatCurrency(commercial.contractValue)}
          </span>
        </div>
        <div className={styles.commercialItem}>
          <span className={styles.commercialLabel}>Wpłacono</span>
          <span className={styles.commercialValue}>
            {formatCurrency(commercial.totalPaid)}
          </span>
        </div>
        <div className={styles.commercialItem}>
          <span className={styles.commercialLabel}>Pozostało</span>
          <span className={styles.commercialValue}>
            {formatCurrency(commercial.remainingToPay)}
          </span>
        </div>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaChip}>
          Zadatek:{' '}
          {commercial.depositPaid >= commercial.agreedDeposit &&
          commercial.agreedDeposit > 0
            ? 'opłacony'
            : commercial.depositPaid > 0
              ? 'częściowo'
              : 'oczekuje'}
        </span>
        {commercial.coverageEndTime ? (
          <span className={styles.metaChip}>
            Do {commercial.coverageEndTime}
          </span>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div className={styles.dateBlock}>
          <span className={styles.date}>
            {formatDate(wedding.date, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <span className={styles.countdown}>
            {days > 0 ? `za ${days} dni` : days === 0 ? 'dziś' : 'minął'}
          </span>
        </div>
        {!onOpen && !disabled ? (
          <IconChevronRight className={styles.chevron} />
        ) : null}
      </div>

      {onOpen && !disabled ? (
        <div className={styles.openAction}>
          <span className={styles.openLabel}>Otwórz ślub</span>
        </div>
      ) : null}
    </Card>
  )

  if (disabled) {
    return <div className={styles.link}>{body}</div>
  }

  if (onOpen) {
    return (
      <button
        type="button"
        className={styles.link}
        onClick={() => onOpen(wedding)}
      >
        {body}
      </button>
    )
  }

  return (
    <Link to={`/sluby/${wedding.id}`} className={styles.link}>
      {body}
    </Link>
  )
}

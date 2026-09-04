import type { ReactNode } from 'react'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { composeModernWeddingHeaderMeta } from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingDetailHeader.module.css'

type Props = {
  wedding: Wedding
  places: WeddingPlace[]
  compact?: boolean
  utilities?: ReactNode
  testId?: string
}

/**
 * Shared wedding identity hero: date rail, couple names, venue/package, status.
 * Does not include Wedding Detail tabs or operational field actions.
 */
export function ModernWeddingIdentityHero({
  wedding,
  places,
  compact = false,
  utilities,
  testId = 'modern-wedding-identity-hero',
}: Props) {
  const meta = composeModernWeddingHeaderMeta(wedding, places)

  return (
    <header
      className={compact ? `${styles.hero} ${styles.heroCompact}` : styles.hero}
      data-testid={testId}
      data-compact={compact ? 'true' : undefined}
    >
      <div
        className={styles.dateBlock}
        data-testid="modern-wedding-header-date"
        aria-hidden={meta.dateParts == null}
      >
        {meta.dateParts ? (
          <>
            <span className={styles.dateDay}>{meta.dateParts.day}</span>
            <span className={styles.dateMonth}>{meta.dateParts.month}</span>
            {meta.dateParts.weekday ? (
              <span className={styles.dateWeek}>{meta.dateParts.weekday}</span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name} data-testid="modern-wedding-header-name">
          {getWeddingDisplayName(wedding)}
        </h1>
        {meta.metaLine ? (
          <p className={styles.meta} data-testid="modern-wedding-header-meta">
            {meta.metaLine}
          </p>
        ) : null}
        {utilities}
      </div>

      <div
        className={styles.countdown}
        data-testid="modern-wedding-header-countdown"
        aria-label="Odliczanie"
      >
        {meta.countdown ? (
          <>
            <span
              className={
                meta.countdown.kind === 'future'
                  ? styles.dateDay
                  : `${styles.dateDay} ${styles.dateDayWord}`
              }
            >
              {meta.countdown.value}
            </span>
            {meta.countdown.unit ? (
              <span className={styles.dateMonth}>{meta.countdown.unit}</span>
            ) : null}
            {meta.countdown.caption ? (
              <span className={styles.dateWeek}>{meta.countdown.caption}</span>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  )
}

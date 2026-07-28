import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconCheck, IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { getNextRecommendedAction, getWorkflowStatus } from '@/lib/workflow/workflowEngine'
import type { Wedding } from '@/types/wedding'
import styles from './NextWeddingCard.module.css'

interface NextWeddingCardProps {
  wedding: Wedding | null
  /** When set, CTA does not navigate via router — used by landing demo. */
  onOpen?: () => void
}

export function NextWeddingCard({ wedding, onOpen }: NextWeddingCardProps) {
  if (!wedding) {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>Brak nadchodzących ślubów</p>
      </section>
    )
  }

  const name = getWeddingDisplayName(wedding, { short: true })
  const days = getDaysUntil(wedding.date)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText
  const status = getWorkflowStatus(wedding)
  const nextAction = getNextRecommendedAction(wedding)

  return (
    <section className={styles.card}>
      <div className={styles.body}>
        <div className={styles.eyebrowRow}>
          <span className={styles.dot} style={{ background: wedding.accentColor }} />
          <span className={styles.eyebrow}>Najbliższy ślub</span>
        </div>

        <h2 className={styles.coupleName}>{name}</h2>

        <div className={styles.meta}>
          <time className={styles.date}>{formatDate(wedding.date)}</time>
          <span className={styles.metaDot}>·</span>
          <span className={styles.package}>{wedding.packageName}</span>
        </div>

        {location ? (
          <div className={styles.location}>
            <IconMapPin width={15} height={15} />
            <span title={location}>{location}</span>
          </div>
        ) : null}

        <div className={styles.status}>
          <span className={styles.stage}>
            <IconCheck width={14} height={14} />
            {status.stageLabel}
          </span>
          <p className={styles.statusMessage}>{status.message}</p>
          {nextAction && <p className={styles.nextAction}>{nextAction.label}</p>}
        </div>

        {onOpen ? (
          <button type="button" className={styles.cta} onClick={onOpen}>
            <span className={styles.ctaLabel}>Otwórz ślub</span>
          </button>
        ) : (
          <Link to={`/sluby/${wedding.id}`} className={styles.cta}>
            <Button variant="primary">Otwórz ślub</Button>
          </Link>
        )}
      </div>

      <div className={styles.countdown}>
        {days === 0 ? (
          <span className={styles.today}>Dziś</span>
        ) : (
          <>
            <span className={styles.days}>{days}</span>
            <span className={styles.daysUnit}>
              {days === 1 ? 'dzień do ślubu' : 'dni do ślubu'}
            </span>
          </>
        )}
      </div>
    </section>
  )
}

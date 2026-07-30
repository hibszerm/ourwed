import { IconMapPin } from '@/components/icons'
import { WorkflowBadge } from '@/components/ui/Badge'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  getHeaderStatusBadges,
  getWeddingCountdownLabel,
  getWeddingDateLabel,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingWorkspaceHeaderProps {
  wedding: Wedding
  places: WeddingPlace[]
}

/**
 * Identity header — name, date, location, status badges.
 * Operational actions live in Contracts / Finance / Management sections.
 */
export function WeddingWorkspaceHeader({
  wedding,
  places,
}: WeddingWorkspaceHeaderProps) {
  const statusBadges = getHeaderStatusBadges(wedding)
  const locationSummary = getWeddingPrimaryLocationSummary(wedding, places)
  const venueLine = [locationSummary.displayText, wedding.packageName?.trim()]
    .filter(Boolean)
    .join(' · ')

  return (
    <header
      className={styles.commandHeader}
      data-testid="wedding-workspace-header"
    >
      <div className={styles.commandMain}>
        <div className={styles.commandIdentity}>
          <h1 className={styles.commandTitle}>
            {getWeddingDisplayName(wedding)}
          </h1>
          <div
            className={styles.commandPills}
            data-testid="wedding-header-status-badges"
          >
            {statusBadges.map((badge) => (
              <span
                key={badge.id}
                className={
                  badge.tone === 'neutral'
                    ? styles.statusPillMuted
                    : styles.statusPill
                }
                data-ready={badge.tone === 'ok' ? 'true' : undefined}
              >
                {badge.label}
              </span>
            ))}
            <WorkflowBadge stage={wedding.workflowStage} />
            {wedding.status === 'archived' ? (
              <span className={styles.statusPillMuted}>Zarchiwizowany</span>
            ) : null}
          </div>
          <p className={styles.commandMetaLine}>
            <time>{getWeddingDateLabel(wedding.date)}</time>
            {getWeddingCountdownLabel(wedding.date) ? (
              <>
                <span aria-hidden> · </span>
                <span>{getWeddingCountdownLabel(wedding.date)}</span>
              </>
            ) : null}
          </p>
          {venueLine ? (
            <p className={styles.commandVenueLine}>
              <IconMapPin width={14} height={14} aria-hidden />
              <span title={locationSummary.displayText ?? undefined}>
                {venueLine}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

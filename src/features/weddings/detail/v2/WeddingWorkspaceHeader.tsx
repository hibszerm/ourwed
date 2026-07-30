import { IconMapPin } from '@/components/icons'
import { WeddingHeaderActions } from '@/features/weddings/detail/v2/WeddingHeaderActions'
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
  onWeddingUpdated?: (wedding: Wedding) => void
  onArchive?: () => Promise<void>
  onDelete?: () => Promise<void>
}

/**
 * Identity header — name, date, location, entity + business badges, overflow.
 */
export function WeddingWorkspaceHeader({
  wedding,
  places,
  onWeddingUpdated,
  onArchive,
  onDelete,
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
                data-badge={badge.id}
              >
                {badge.label}
              </span>
            ))}
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
        {onWeddingUpdated && onArchive && onDelete ? (
          <WeddingHeaderActions
            wedding={wedding}
            onWeddingUpdated={onWeddingUpdated}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ) : null}
      </div>
    </header>
  )
}

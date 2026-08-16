import { WeddingNextActionCard } from '@/features/weddings/detail/v2/WeddingNextActionCard'
import type { WeddingNextActionHandlers } from '@/features/weddings/detail/v2/dispatchWeddingNextAction'
import { WeddingOverviewAttention } from '@/features/weddings/detail/v2/WeddingOverviewAttention'
import { WeddingOverviewEssentials } from '@/features/weddings/detail/v2/WeddingOverviewEssentials'
import { WeddingProgressCard } from '@/features/weddings/detail/v2/WeddingProgressCard'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingOverviewWorkspaceProps {
  wedding: Wedding
  places: WeddingPlace[]
  nextActionHandlers: WeddingNextActionHandlers
  onOpenFinanceTab?: () => void
  onEditLocations: () => void
  onEditContacts?: () => void
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}

/**
 * Calm full-width Overview — Next Action + progress + essentials + Attention.
 * Next Action uses shared resolveWeddingNextAction (Phase 1B).
 */
export function WeddingOverviewWorkspace({
  wedding,
  places,
  nextActionHandlers,
  onOpenFinanceTab,
  onEditLocations,
  onEditContacts,
  onEditPackage,
  onShowPackageDetails,
}: WeddingOverviewWorkspaceProps) {
  return (
    <div
      className={styles.overviewMain}
      data-testid="wedding-overview-workspace"
    >
      <WeddingNextActionCard
        wedding={wedding}
        places={places}
        handlers={nextActionHandlers}
      />

      <WeddingProgressCard wedding={wedding} places={places} />

      <WeddingOverviewEssentials
        wedding={wedding}
        places={places}
        onEditLocations={onEditLocations}
        onEditContacts={onEditContacts}
        onEditPackage={onEditPackage}
        onShowPackageDetails={onShowPackageDetails}
      />

      <WeddingOverviewAttention
        wedding={wedding}
        onOpenFinance={onOpenFinanceTab}
      />
    </div>
  )
}

import { WeddingOverviewAttention } from '@/features/weddings/detail/v2/WeddingOverviewAttention'
import { WeddingOverviewEssentials } from '@/features/weddings/detail/v2/WeddingOverviewEssentials'
import { WeddingProgressCard } from '@/features/weddings/detail/v2/WeddingProgressCard'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingOverviewWorkspaceProps {
  wedding: Wedding
  places: WeddingPlace[]
  onSendQuestionnaire?: () => void
  onOpenPreWeddingTab?: () => void
  onOpenFinanceTab?: () => void
  onEditLocations: () => void
  onEditContacts?: () => void
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}

/**
 * Calm full-width Overview — progress + essentials only.
 * Detailed questionnaires, history, and admin live in other tabs / header menu.
 */
export function WeddingOverviewWorkspace({
  wedding,
  places,
  onSendQuestionnaire,
  onOpenPreWeddingTab,
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
      <WeddingProgressCard
        wedding={wedding}
        places={places}
        onPrimaryAction={(actionId) => {
          if (actionId === 'send_prewedding' || actionId === 'open_prewedding') {
            onOpenPreWeddingTab?.()
            return
          }
          if (actionId === 'send_contract_questionnaire') {
            onSendQuestionnaire?.()
          }
        }}
      />

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

import type { WeddingHeroAction } from '@/features/weddings/components/detail/WeddingDetailHero'
import { WeddingIssuesSummary } from '@/features/weddings/detail/v2/WeddingIssuesSummary'
import { WeddingMilestoneRail } from '@/features/weddings/detail/v2/WeddingMilestoneRail'
import { WeddingNextAction } from '@/features/weddings/detail/v2/WeddingNextAction'
import { WeddingRecentActivity } from '@/features/weddings/detail/v2/WeddingRecentActivity'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import type { CompletenessItem } from '@/lib/utils/weddingContractReadiness'
import type { NextActionKind } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WorkflowStage } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingOverviewWorkspaceProps {
  stage: WorkflowStage
  nextAction: {
    title: string
    description: string
    actionLabel: string | null
    actionKind: NextActionKind
  }
  missing: CompletenessItem[]
  recent: ActivityFeedItem[]
  onAction: (action: WeddingHeroAction) => void
  onOpenContractTab: () => void
  onOpenActivityTab: () => void
}

export function WeddingOverviewWorkspace({
  stage,
  nextAction,
  missing,
  recent,
  onAction,
  onOpenContractTab,
  onOpenActivityTab,
}: WeddingOverviewWorkspaceProps) {
  return (
    <div
      className={styles.overviewMain}
      data-testid="wedding-overview-workspace"
    >
      <WeddingNextAction
        title={nextAction.title}
        description={nextAction.description}
        actionLabel={nextAction.actionLabel}
        actionKind={nextAction.actionKind}
        onAction={onAction}
      />
      <WeddingMilestoneRail stage={stage} />
      <WeddingIssuesSummary
        missing={missing}
        onOpenContractTab={onOpenContractTab}
      />
      <WeddingRecentActivity items={recent} onShowAll={onOpenActivityTab} />
    </div>
  )
}

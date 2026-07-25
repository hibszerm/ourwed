import { WeddingMilestoneRail } from '@/features/weddings/detail/v2/WeddingMilestoneRail'
import { WeddingRecentActivity } from '@/features/weddings/detail/v2/WeddingRecentActivity'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import type { WorkflowStage } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingOverviewWorkspaceProps {
  stage: WorkflowStage
  recent: ActivityFeedItem[]
  onOpenActivityTab: () => void
}

/**
 * Overview focuses on wedding identity context already in the header/band,
 * workflow progression, and recent activity — not contract-readiness detail.
 */
export function WeddingOverviewWorkspace({
  stage,
  recent,
  onOpenActivityTab,
}: WeddingOverviewWorkspaceProps) {
  return (
    <div
      className={styles.overviewMain}
      data-testid="wedding-overview-workspace"
    >
      <WeddingMilestoneRail stage={stage} />
      <WeddingRecentActivity items={recent} onShowAll={onOpenActivityTab} />
    </div>
  )
}

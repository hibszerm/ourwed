import { getWorkflowDisplayState } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WorkflowStage } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

export function WeddingMilestoneRail({ stage }: { stage: WorkflowStage }) {
  const flow = getWorkflowDisplayState(stage)

  return (
    <section
      className={styles.milestoneSection}
      aria-label="Przebieg zlecenia"
      data-testid="wedding-milestone-rail"
    >
      <h2 className={styles.sectionHeading}>Przebieg</h2>
      <ol className={styles.milestoneRail}>
        {flow.stages.map((s, index) => (
          <li key={s.id} className={styles.milestoneItem} data-state={s.state}>
            <div className={styles.milestoneNodeRow}>
              <span className={styles.milestoneDot} aria-hidden />
              {index < flow.stages.length - 1 ? (
                <span className={styles.milestoneLine} aria-hidden />
              ) : null}
            </div>
            <span className={styles.milestoneLabel}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className={styles.milestoneNow}>
        <strong>{flow.label}.</strong> {flow.guidance}
      </p>
    </section>
  )
}

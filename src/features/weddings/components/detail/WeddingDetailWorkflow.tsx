import { WORKFLOW_STAGES, WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import type { WorkflowStage } from '@/types/wedding'
import styles from './WeddingDetailWorkflow.module.css'

interface WeddingDetailWorkflowProps {
  currentStage: WorkflowStage
}

export function WeddingDetailWorkflow({ currentStage }: WeddingDetailWorkflowProps) {
  const currentIndex = WORKFLOW_STAGES.indexOf(currentStage)

  return (
    <section className={styles.workflow} aria-label="Workflow">
      <ol className={styles.track}>
        {WORKFLOW_STAGES.map((stage, index) => {
          const isPast = index < currentIndex
          const isCurrent = index === currentIndex
          const isFuture = index > currentIndex
          const label = WORKFLOW_STAGE_LABELS[stage]

          return (
            <li key={stage} className={styles.item}>
              <div
                className={`${styles.stage} ${isPast ? styles.past : ''} ${isCurrent ? styles.current : ''} ${isFuture ? styles.future : ''}`}
              >
                <span className={styles.dot} />
                <span className={styles.label}>{label}</span>
              </div>
              {index < WORKFLOW_STAGES.length - 1 && (
                <span className={`${styles.connector} ${isPast ? styles.connectorDone : ''}`} />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

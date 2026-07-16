import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  getWorkflowProgress,
} from '@/lib/utils/workflow'
import type { WorkflowStage } from '@/types/wedding'
import styles from './WorkflowSection.module.css'

interface WorkflowSectionProps {
  stage: WorkflowStage
}

export function WorkflowSection({ stage }: WorkflowSectionProps) {
  const progress = getWorkflowProgress(stage)
  const currentIndex = WORKFLOW_STAGES.indexOf(stage)

  return (
    <Card>
      <CardHeader
        title="Workflow"
        subtitle={WORKFLOW_STAGE_LABELS[stage]}
      />
      <ProgressBar value={progress} max={100} />

      <ol className={styles.stages}>
        {WORKFLOW_STAGES.map((s, index) => {
          const isPast = index < currentIndex
          const isCurrent = index === currentIndex

          return (
            <li
              key={s}
              className={`${styles.stage} ${isPast ? styles.past : ''} ${isCurrent ? styles.current : ''}`}
            >
              <span className={styles.dot} />
              <span className={styles.label}>{WORKFLOW_STAGE_LABELS[s]}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

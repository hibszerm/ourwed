import type { WorkflowStage } from '@/types/wedding'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import styles from './Badge.module.css'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>
}

const workflowVariant: Record<WorkflowStage, BadgeProps['variant']> = {
  reservation: 'neutral',
  contract: 'info',
  deposit: 'info',
  preparation: 'warning',
  pre_wedding_questionnaire: 'warning',
  wedding_day: 'warning',
  post_production: 'info',
  completed: 'success',
}

export function WorkflowBadge({ stage }: { stage: WorkflowStage }) {
  return (
    <Badge variant={workflowVariant[stage]}>
      {WORKFLOW_STAGE_LABELS[stage]}
    </Badge>
  )
}

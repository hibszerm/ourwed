import { Card, CardHeader } from '@/components/ui/Card'
import { getWorkflowStatus } from '@/lib/workflow/workflowEngine'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailStatus.module.css'

interface WeddingDetailStatusProps {
  wedding: Wedding
}

export function WeddingDetailStatus({ wedding }: WeddingDetailStatusProps) {
  const status = getWorkflowStatus(wedding)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Status zlecenia" />
      <div className={styles.body}>
        <span className={styles.dot} />
        <div>
          <p className={styles.stage}>{status.stageLabel}</p>
          <p className={styles.message}>{status.message}</p>
        </div>
      </div>
    </Card>
  )
}

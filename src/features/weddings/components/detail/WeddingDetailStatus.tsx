import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Input'
import { getWorkflowStatus } from '@/lib/workflow/workflowEngine'
import { WORKFLOW_STAGE_LABELS, WORKFLOW_STAGES } from '@/lib/utils/workflow'
import type { Wedding, WeddingStatus, WorkflowStage } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailStatus.module.css'

interface WeddingDetailStatusProps {
  wedding: Wedding
  editing?: boolean
  onChangeWedding?: (patch: Partial<Wedding>) => void
}

const STATUS_LABELS: Record<WeddingStatus, string> = {
  active: 'Aktywny',
  archived: 'Zarchiwizowany',
  cancelled: 'Anulowany',
}

export function WeddingDetailStatus({
  wedding,
  editing = false,
  onChangeWedding,
}: WeddingDetailStatusProps) {
  const status = getWorkflowStatus(wedding)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Status zlecenia" />
      {editing ? (
        <div className={editStyles.fieldGrid}>
          <Select
            label="Status ślubu"
            value={wedding.status}
            onChange={(e) =>
              onChangeWedding?.({ status: e.target.value as WeddingStatus })
            }
          >
            {(Object.keys(STATUS_LABELS) as WeddingStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABELS[key]}
              </option>
            ))}
          </Select>
          <Select
            label="Etap workflow"
            value={wedding.workflowStage}
            onChange={(e) =>
              onChangeWedding?.({
                workflowStage: e.target.value as WorkflowStage,
              })
            }
          >
            {WORKFLOW_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {WORKFLOW_STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className={styles.body}>
          <span className={styles.dot} />
          <div>
            <p className={styles.stage}>
              {status.stageLabel}
              {wedding.status === 'archived' ? ' · Zarchiwizowany' : ''}
            </p>
            <p className={styles.message}>{status.message}</p>
          </div>
        </div>
      )}
    </Card>
  )
}

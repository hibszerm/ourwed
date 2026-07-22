import {
  contractStatusLabel,
  type ContractUiStatus,
} from '@/features/documents/contractUi'
import styles from '../DocumentsTemplates.module.css'

export function ContractStatusBadge({
  status,
}: {
  status: ContractUiStatus
}) {
  return (
    <span
      className={`${styles.statusBadge} ${styles[`status_${status}`]}`}
      data-status={status}
    >
      {contractStatusLabel(status)}
    </span>
  )
}

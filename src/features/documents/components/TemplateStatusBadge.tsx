import type { DocumentTemplateStatus } from '@/types/documents'
import { getStatusLabel } from '@/features/documents/templateMeta'
import styles from '../DocumentsTemplates.module.css'

export function TemplateStatusBadge({
  status,
}: {
  status: DocumentTemplateStatus
}) {
  const tone =
    status === 'ready'
      ? styles.badgeReady
      : status === 'archived'
        ? styles.badgeArchived
        : styles.badgeDraft

  return (
    <span className={`${styles.badge} ${tone}`}>{getStatusLabel(status)}</span>
  )
}

export function TemplateDefaultBadge() {
  return <span className={`${styles.badge} ${styles.badgeDefault}`}>Domyślny</span>
}

import styles from './LocalReadOnlyNotice.module.css'
import { ProLockIcon } from '@/features/billing/ProLockIcon'

type Props = {
  visible: boolean
  className?: string
}

/** Compact local notice for mutation-heavy screens when expired. */
export function LocalReadOnlyNotice({ visible, className = '' }: Props) {
  if (!visible) return null
  return (
    <p
      className={`${styles.notice} ${className}`.trim()}
      role="status"
      data-testid="local-readonly-notice"
    >
      <ProLockIcon className={styles.icon} />
      <span>Tryb tylko do odczytu · Edycja wymaga PRO</span>
    </p>
  )
}

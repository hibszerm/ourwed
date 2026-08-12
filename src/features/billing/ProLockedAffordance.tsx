import type { ReactNode } from 'react'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import { PRO_LOCKED_ARIA, PRO_LOCKED_HINT } from '@/features/billing/proGateActions'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import styles from './ProLockedAffordance.module.css'

type Props = {
  /** When true, always show locked presentation (caller already knows). */
  locked?: boolean
  showLabel?: boolean
  className?: string
  children?: ReactNode
}

/**
 * Shared PRO-locked presentation: lock icon + optional “Wymaga PRO” + tooltip.
 * Pair with requirePro / ProGateAction — does not gate by itself.
 */
export function ProLockedAffordance({
  locked,
  showLabel = false,
  className = '',
  children,
}: Props) {
  const { canUsePro } = useProAccessGate()
  const isLocked = locked ?? canUsePro === false
  if (!isLocked) return children ? <>{children}</> : null

  return (
    <span
      className={`${styles.wrap} ${className}`.trim()}
      title={PRO_LOCKED_HINT}
      aria-label={PRO_LOCKED_ARIA}
    >
      <ProLockIcon className={styles.icon} />
      {showLabel ? <span className={styles.label}>Wymaga PRO</span> : null}
      {children}
    </span>
  )
}

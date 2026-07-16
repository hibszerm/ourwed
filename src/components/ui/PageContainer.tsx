import type { ReactNode } from 'react'
import styles from './PageContainer.module.css'

type PageWidth = 'default' | 'wide' | 'narrow' | 'full'

interface PageContainerProps {
  children: ReactNode
  width?: PageWidth
  className?: string
}

/**
 * Centers page content with a consistent max-width token.
 * Use inside AppLayout content — does not change business logic.
 */
export function PageContainer({
  children,
  width = 'default',
  className = '',
}: PageContainerProps) {
  return (
    <div className={`${styles.container} ${styles[width]} ${className}`.trim()}>
      {children}
    </div>
  )
}

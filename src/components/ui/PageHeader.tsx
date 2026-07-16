import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  title?: string
  subtitle?: string
  action?: ReactNode
}

/** Shared studio page header — Apple / Linear calm hierarchy. */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  if (!title && !action) return null

  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {title && <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  )
}

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import styles from './AuthShell.module.css'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: AuthShellProps) {
  return (
    <div className={styles.page}>
      <div className={`${styles.card} ${wide ? styles.wide : ''}`.trim()}>
        <Link to="/" className={styles.brand}>
          <span className={styles.logoMark} aria-hidden>
            OW
          </span>
          <span className={styles.logoText}>OurWed</span>
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </header>

        {children}

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  )
}

import type { ReactNode, CSSProperties } from 'react'
import styles from './Card.module.css'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  /** default = radius-lg; elevated = radius-xl (hero panels) */
  elevation?: 'default' | 'elevated'
  hover?: boolean
  style?: CSSProperties
}

export function Card({
  children,
  className = '',
  padding = 'md',
  elevation = 'default',
  hover = false,
  style,
}: CardProps) {
  return (
    <div
      className={[
        styles.card,
        styles[padding],
        elevation === 'elevated' ? styles.elevated : '',
        hover ? styles.hover : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <h3 className={styles.title}>{title}</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}

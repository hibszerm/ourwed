import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthVisualPanel } from '@/features/auth/components/AuthVisualPanel'
import styles from './AuthShell.module.css'

export type AuthShellLayout = 'split' | 'simple'

interface AuthShellProps {
  /** Primary heading. Prefer ReactNode for multi-line editorial headlines. */
  title: ReactNode
  subtitle?: string
  /** Optional uppercase eyebrow above the headline (split login/register). */
  eyebrow?: string
  children: ReactNode
  /**
   * Header switch link (split) or bottom footer (simple).
   * Split pages pass switch via `switchPrompt` / `switchTo` / `switchLabel`.
   */
  footer?: ReactNode
  /** @deprecated Prefer layout="split"; kept for call-site compatibility. */
  wide?: boolean
  layout?: AuthShellLayout
  /** Quiet legal line under the form (split). Plain text — no invented URLs. */
  legal?: ReactNode
  switchPrompt?: string
  switchLabel?: string
  switchTo?: string
  /** Split only: optical centers short login content; start for long register. */
  align?: 'optical' | 'start'
}

/**
 * Public Studio auth canvas.
 * Split: editorial left + product visual right (login/register).
 * Simple: warm single-column for forgot / reset / check-email / callback.
 */
export function AuthShell({
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  wide = false,
  layout,
  legal,
  switchPrompt,
  switchLabel,
  switchTo,
  align = 'start',
}: AuthShellProps) {
  const resolvedLayout: AuthShellLayout = layout ?? 'simple'
  const isSplit = resolvedLayout === 'split'

  const brand = (
    <Link to="/" className={styles.brand} data-auth-brand="">
      <span className={styles.logoMark} aria-hidden>
        OW
      </span>
      <span className={styles.logoText}>OurWed</span>
    </Link>
  )

  const switchLink =
    switchTo && switchLabel ? (
      <p className={styles.switch}>
        {switchPrompt ? <span className={styles.switchPrompt}>{switchPrompt}</span> : null}
        {switchPrompt ? ' ' : null}
        <Link to={switchTo} className={styles.switchLink}>
          {switchLabel}
        </Link>
      </p>
    ) : null

  if (!isSplit) {
    return (
      <div
        className={`${styles.page} ${styles.pageSimple}`}
        data-auth-shell="simple"
        data-auth-wide={wide ? 'true' : 'false'}
      >
        <div className={`${styles.simpleInner} ${wide ? styles.simpleWide : ''}`.trim()}>
          <div className={styles.simpleTop}>{brand}</div>
          <div className={styles.contentEnter}>
            <header className={styles.header}>
              {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </header>
            {children}
            {footer ? <div className={styles.footer}>{footer}</div> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${styles.page} ${styles.pageSplit}`}
      data-auth-shell="split"
      data-auth-align={align}
    >
      <div className={styles.left} data-auth-left="">
        <div className={styles.leftInner}>
          <div className={styles.topBar}>
            {brand}
            {switchLink}
          </div>

          <div
            className={`${styles.contentEnter} ${align === 'optical' ? styles.contentStage : ''}`.trim()}
          >
            <div className={styles.contentBlock}>
              <header className={styles.header}>
                {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
                <h1 className={styles.title}>{title}</h1>
                {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
              </header>

              {children}

              {legal ? <p className={styles.legal}>{legal}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.right} data-auth-right="">
        <AuthVisualPanel />
      </div>
    </div>
  )
}

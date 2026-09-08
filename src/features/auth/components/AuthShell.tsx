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
  /** Optional content below the form inside the shared slot (e.g. back link). */
  afterForm?: ReactNode
  /**
   * Presentational density hint for shared desktop CSS (login vs taller register).
   * Does not change auth logic.
   */
  variant?: 'login' | 'register' | 'other'
}

/**
 * Public Studio auth canvas.
 * Split: shared editorial content slot + product visual (login/register/forgot/…).
 * Simple: reserved for minimal callback confirm/error when split is unnecessary.
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
  afterForm,
  variant = 'other',
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
    <div className={`${styles.page} ${styles.pageSplit}`} data-auth-shell="split">
      <div className={styles.left} data-auth-left="">
        <div className={styles.leftInner}>
          <div className={styles.topBar} data-auth-top-bar="">
            {brand}
            {switchLink}
          </div>

          <div className={styles.mainRegion} data-auth-main-region="">
            <div className={styles.contentEnter}>
              <div
                className={styles.authContentSlot}
                data-auth-content-slot=""
                data-auth-variant={variant}
              >
                <header className={styles.header} data-auth-editorial="">
                  {eyebrow ? (
                    <p className={styles.eyebrow} data-auth-eyebrow="">
                      {eyebrow}
                    </p>
                  ) : null}
                  <h1 className={styles.title} data-auth-heading="">
                    {title}
                  </h1>
                  {subtitle ? (
                    <p className={styles.subtitle} data-auth-support="">
                      {subtitle}
                    </p>
                  ) : null}
                </header>

                <div data-auth-form-region="">{children}</div>

                {afterForm}

                {legal ? <p className={styles.legal}>{legal}</p> : null}

                {footer ? <div className={styles.slotFooter}>{footer}</div> : null}
              </div>
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

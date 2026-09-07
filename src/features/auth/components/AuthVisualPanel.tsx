import type { ReactNode } from 'react'
import styles from './AuthVisualPanel.module.css'

type Props = {
  /** Future: pass <OurWedAuthProductVisual />. Omit for placeholder. */
  children?: ReactNode
}

/**
 * Desktop product-story surface for Studio auth.
 * Placeholder only — replace children with the product visual later.
 */
export function AuthVisualPanel({ children }: Props) {
  return (
    <aside
      className={styles.panel}
      data-auth-visual-panel=""
      aria-hidden={children ? undefined : true}
    >
      <div className={styles.frame} data-auth-visual-frame="">
        {children ?? (
          <div className={styles.placeholder} data-auth-visual-placeholder="">
            <span className={styles.placeholderLabel}>PRODUCT VISUAL — PLACEHOLDER</span>
          </div>
        )}
      </div>
    </aside>
  )
}

import { Link } from 'react-router-dom'
import {
  sidebarSubscriptionCopy,
  type AccountEntitlement,
} from '@/lib/billing/entitlement'
import styles from './SidebarSubscriptionBlock.module.css'

type Props = {
  entitlement: AccountEntitlement | null
  loading?: boolean
  error?: boolean
  onNavigate?: () => void
}

export function SidebarSubscriptionBlock({
  entitlement,
  loading,
  error,
  onNavigate,
}: Props) {
  if (loading || !entitlement) {
    return (
      <div
        className={styles.block}
        data-testid="sidebar-subscription-skeleton"
        aria-hidden
      >
        <div className={styles.skelTitle} />
        <div className={styles.skelLine} />
        <div className={styles.skelRail} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.block} data-testid="sidebar-subscription-error">
        <p className={styles.title}>Subskrypcja</p>
        <p className={styles.subtitle}>Nie udało się sprawdzić statusu.</p>
      </div>
    )
  }

  const copy = sidebarSubscriptionCopy(entitlement)

  return (
    <Link
      to="/ustawienia/subskrypcja"
      className={`${styles.block} ${styles[`tone_${copy.tone}`]}`}
      data-testid="sidebar-subscription"
      data-source={entitlement.source}
      onClick={onNavigate}
    >
      <div className={styles.row}>
        <p className={styles.title}>{copy.title}</p>
        {copy.ctaLabel ? <span className={styles.cta}>{copy.ctaLabel} →</span> : null}
      </div>
      <p className={styles.subtitle}>{copy.subtitle}</p>
      {copy.showProgress ? (
        <div className={styles.rail} aria-hidden>
          <div
            className={styles.railFill}
            style={{ width: `${Math.round(copy.progress * 100)}%` }}
          />
        </div>
      ) : null}
    </Link>
  )
}

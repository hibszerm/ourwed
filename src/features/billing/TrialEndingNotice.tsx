import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { getTrialTimeRemaining } from '@/lib/billing/entitlement'
import styles from './TrialEndingNotice.module.css'

const DISMISS_KEY = 'ourwed.trialEndingNotice.dismissedUntil'

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    return Date.now() < Number(raw)
  } catch {
    return false
  }
}

/**
 * Calm dashboard notice when trial ends within 7 days.
 * Dismissible for 24h; not shown on every login as a modal.
 */
export function TrialEndingNotice() {
  const { entitlement, loading } = useProAccessGate()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed || loading || !entitlement) return null
  if (entitlement.source !== 'trial' || entitlement.accessLevel !== 'pro') return null
  const rem = getTrialTimeRemaining(entitlement.trialEndsAt)
  if (rem.ended || !rem.endingSoon) return null

  const message =
    rem.kind === 'today'
      ? 'Twój Trial PRO kończy się dzisiaj.'
      : rem.fullDays === 1
        ? 'Twój Trial PRO kończy się za 1 dzień.'
        : `Twój Trial PRO kończy się za ${rem.fullDays} dni.`

  return (
    <aside className={styles.notice} data-testid="trial-ending-notice">
      <div>
        <p className={styles.title}>{message}</p>
        <p className={styles.copy}>Wybierz plan, aby zachować pełny dostęp do funkcji.</p>
      </div>
      <div className={styles.actions}>
        <Link to="/ustawienia/subskrypcja" className={styles.cta}>
          Zobacz plany
        </Link>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => {
            try {
              localStorage.setItem(
                DISMISS_KEY,
                String(Date.now() + 24 * 60 * 60 * 1000),
              )
            } catch {
              /* ignore */
            }
            setDismissed(true)
          }}
        >
          Zamknij
        </button>
      </div>
    </aside>
  )
}

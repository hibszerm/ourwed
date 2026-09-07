import { useEffect, useState } from 'react'
import { ACCOUNT_DELETED_QUERY } from '@/features/account-deletion/accountDeletionTypes'
import styles from '@/features/account-deletion/AccountDeletedNotice.module.css'

/**
 * One-shot landing notice after successful account deletion (?accountDeleted=1).
 * Strips the query param so refresh does not re-show the message.
 */
export function AccountDeletedNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get(ACCOUNT_DELETED_QUERY) !== '1') return
      setVisible(true)
      url.searchParams.delete(ACCOUNT_DELETED_QUERY)
      const next = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, '', next || '/')
    } catch {
      // ignore
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={styles.banner}
      role="status"
      data-testid="account-deleted-notice"
    >
      <p className={styles.text}>Konto zostało usunięte.</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => setVisible(false)}
        aria-label="Zamknij komunikat"
      >
        Zamknij
      </button>
    </div>
  )
}

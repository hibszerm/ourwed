import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import styles from '@/admin/styles/admin.module.css'

/**
 * Shown after password auth when the account is not an enabled owner.
 * Forces sign-out so no admin shell remains.
 */
export function AdminUnauthorizedPage() {
  const { session, signOut } = useAdminAuth()

  useEffect(() => {
    if (session) {
      void signOut()
    }
  }, [session, signOut])

  return (
    <div className={`${styles.page} ${styles.authCenter}`} data-testid="admin-unauthorized">
      <div className={`${styles.authCard} ${styles.sans}`}>
        <h1 className={styles.brand}>Brak dostępu</h1>
        <p className={styles.lead}>
          To konto nie ma uprawnień administratora OurWed.
        </p>
        <Link to="/login" className={styles.primaryBtn} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
          Wróć do logowania
        </Link>
      </div>
    </div>
  )
}

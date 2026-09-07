import { Link, Navigate, useLocation } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { CheckEmailPanel } from '@/features/auth/components/CheckEmailPanel'
import { useAuth } from '@/features/auth/AuthProvider'
import shellStyles from '@/features/auth/components/AuthShell.module.css'
import styles from '@/features/auth/components/AuthForms.module.css'

export function CheckEmailPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      layout="split"
      eyebrow="AKTYWACJA KONTA"
      title={
        <>
          <span className={shellStyles.titleLine}>Prawie gotowe.</span>
        </>
      }
      subtitle="Sprawdź skrzynkę e-mail i kliknij link aktywacyjny, aby dokończyć rejestrację."
      afterForm={
        <p className={styles.backLink}>
          <Link to="/login">← Wróć do logowania</Link>
        </p>
      }
    >
      <CheckEmailPanel email={email} />
    </AuthShell>
  )
}

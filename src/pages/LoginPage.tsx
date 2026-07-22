import { Link, Navigate, useLocation } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from '@/features/auth/components/AuthForms.module.css'

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const passwordReset = Boolean(
    (location.state as { passwordReset?: boolean } | null)?.passwordReset,
  )

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      title="Zaloguj się"
      subtitle="Wejdź do studia, aby zarządzać ślubami, ankietami i finansami."
      footer={
        <>
          Nie masz konta? <Link to="/register">Utwórz konto</Link>
        </>
      }
    >
      {passwordReset ? (
        <p className={styles.formSuccess} role="status">
          Hasło zostało zmienione. Możesz się zalogować.
        </p>
      ) : null}
      <LoginForm />
    </AuthShell>
  )
}

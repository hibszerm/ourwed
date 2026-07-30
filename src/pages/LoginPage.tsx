import { Link, Navigate, useLocation } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from '@/features/auth/components/AuthForms.module.css'

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const state = (location.state as {
    passwordReset?: boolean
    emailConfirmed?: boolean
    emailChanged?: boolean
  } | null) ?? null
  const passwordReset = Boolean(state?.passwordReset)
  const emailConfirmed = Boolean(state?.emailConfirmed)
  const emailChanged = Boolean(state?.emailChanged)

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      title="Zaloguj się"
      subtitle="Wejdź do konta, aby zarządzać projektami, ankietami i finansami."
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
      {emailConfirmed ? (
        <p className={styles.formSuccess} role="status">
          Adres e-mail został potwierdzony. Możesz się zalogować.
        </p>
      ) : null}
      {emailChanged ? (
        <p className={styles.formSuccess} role="status">
          Adres e-mail został zmieniony. Zaloguj się ponownie.
        </p>
      ) : null}
      <LoginForm />
    </AuthShell>
  )
}

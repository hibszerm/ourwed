import { Navigate, useLocation } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useAuth } from '@/features/auth/AuthProvider'
import shellStyles from '@/features/auth/components/AuthShell.module.css'
import styles from '@/features/auth/components/AuthForms.module.css'
import { AuthLegalLoginCopy } from '@/features/legal/LegalLinks'

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
      layout="split"
      eyebrow="WITAJ PONOWNIE"
      title={
        <>
          <span className={shellStyles.titleLine}>Zaloguj się</span>
          <span className={shellStyles.titleLine}>do swojego studia.</span>
        </>
      }
      subtitle="Wróć do swoich zleceń, klientów i planu pracy."
      switchPrompt="Nie masz konta?"
      switchLabel="Załóż konto"
      switchTo="/register"
      legal={<AuthLegalLoginCopy />}
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

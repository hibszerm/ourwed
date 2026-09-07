import { Link, Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { useAuth } from '@/features/auth/AuthProvider'
import shellStyles from '@/features/auth/components/AuthShell.module.css'
import styles from '@/features/auth/components/AuthForms.module.css'

/**
 * Opened from Supabase password-reset email.
 * AuthProvider sets isPasswordRecovery on PASSWORD_RECOVERY event.
 */
export function ResetPasswordPage() {
  const { isLoading, isPasswordRecovery, isAuthenticated } = useAuth()

  if (isLoading) return <AuthLoadingScreen />

  // After successful reset we sign out and redirect; during recovery we show the form.
  if (!isPasswordRecovery && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  if (!isPasswordRecovery) {
    return (
      <AuthShell
        layout="split"
        eyebrow="RESET HASŁA"
        title={
          <>
            <span className={shellStyles.titleLine}>Link wygasł</span>
            <span className={shellStyles.titleLine}>lub jest nieprawidłowy.</span>
          </>
        }
        subtitle="Poproś o nowy link resetujący hasło."
        afterForm={
          <p className={styles.backLink}>
            <Link to="/forgot-password">← Wyślij ponownie</Link>
          </p>
        }
      >
        <div className={styles.successPanel}>
          <p className={styles.successBody}>
            Otwórz najnowszy e-mail z resetem hasła albo wyślij prośbę jeszcze raz.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      layout="split"
      eyebrow="NOWE HASŁO"
      title={
        <>
          <span className={shellStyles.titleLine}>Ustaw nowe hasło</span>
          <span className={shellStyles.titleLine}>do swojego studia.</span>
        </>
      }
      subtitle="Wybierz silne hasło do konta OurWed."
      afterForm={
        <p className={styles.backLink}>
          <Link to="/login">← Wróć do logowania</Link>
        </p>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}

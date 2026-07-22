import { Link, Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { useAuth } from '@/features/auth/AuthProvider'
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
        title="Link wygasł lub jest nieprawidłowy"
        subtitle="Poproś o nowy link resetujący hasło."
        footer={<Link to="/forgot-password">Wyślij ponownie</Link>}
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
      title="Nowe hasło"
      subtitle="Ustaw nowe hasło do konta OurWed."
      footer={<Link to="/login">Wróć do logowania</Link>}
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}

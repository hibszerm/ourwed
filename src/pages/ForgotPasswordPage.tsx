import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'
import { useAuth } from '@/features/auth/AuthProvider'
import shellStyles from '@/features/auth/components/AuthShell.module.css'
import styles from '@/features/auth/components/AuthForms.module.css'

export function ForgotPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  if (sentTo) {
    return (
      <AuthShell
        layout="split"
        eyebrow="RESET HASŁA"
        title={
          <>
            <span className={shellStyles.titleLine}>Sprawdź</span>
            <span className={shellStyles.titleLine}>swoją skrzynkę.</span>
          </>
        }
        subtitle={`Wysłaliśmy link do resetu hasła na ${sentTo}.`}
        afterForm={
          <p className={styles.backLink}>
            <Link to="/login">← Wróć do logowania</Link>
          </p>
        }
      >
        <div className={styles.successPanel}>
          <div className={styles.successIcon} aria-hidden>
            ✓
          </div>
          <p className={styles.successBody}>
            Otwórz wiadomość i ustaw nowe hasło. Link jest ważny przez ograniczony
            czas.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      layout="split"
      eyebrow="RESET HASŁA"
      title={
        <>
          <span className={shellStyles.titleLine}>Odzyskaj dostęp</span>
          <span className={shellStyles.titleLine}>do swojego studia.</span>
        </>
      }
      subtitle="Podaj adres e-mail używany w OurWed. Wyślemy Ci bezpieczny link do ustawienia nowego hasła."
      afterForm={
        <p className={styles.backLink}>
          <Link to="/login">← Wróć do logowania</Link>
        </p>
      }
    >
      <ForgotPasswordForm onSent={setSentTo} />
    </AuthShell>
  )
}

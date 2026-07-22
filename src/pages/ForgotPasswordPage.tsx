import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from '@/features/auth/components/AuthForms.module.css'

export function ForgotPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  if (sentTo) {
    return (
      <AuthShell
        title="Sprawdź swoją skrzynkę e-mail"
        subtitle={`Wysłaliśmy link do resetu hasła na ${sentTo}.`}
        footer={
          <>
            <Link to="/login">Wróć do logowania</Link>
          </>
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
      title="Reset hasła"
      subtitle="Podaj adres e-mail powiązany z kontem. Wyślemy link do zmiany hasła."
      footer={
        <>
          <Link to="/login">Wróć do logowania</Link>
        </>
      }
    >
      <ForgotPasswordForm onSent={setSentTo} />
    </AuthShell>
  )
}

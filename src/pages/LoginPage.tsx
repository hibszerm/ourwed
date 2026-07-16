import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from './LoginPage.module.css'

/**
 * Login UI only. Credential validation lives exclusively in authService.
 */
export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    // Read from the DOM so browser autofill is included (React state can lag).
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    if (!email.trim() || !password) {
      setError('Podaj e-mail i hasło.')
      return
    }

    setBusy(true)
    try {
      const result = await login(email, password)
      if (result.success) {
        navigate('/dashboard', { replace: true })
        return
      }
      setError(result.error)
    } catch {
      setError('Nie udało się zalogować. Spróbuj ponownie.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logoMark}>OW</span>
          <span className={styles.logoText}>OurWed</span>
        </div>

        <header className={styles.header}>
          <h1 className={styles.title}>Zaloguj się</h1>
          <p className={styles.subtitle}>
            Wejdź do studia, aby zarządzać ślubami, ankietami i finansami.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            id="login-email"
            name="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            disabled={busy}
            required
          />
          <Input
            id="login-password"
            name="password"
            label="Hasło"
            type="password"
            autoComplete="current-password"
            disabled={busy}
            required
          />

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={busy}
          >
            {busy ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>
      </div>
    </div>
  )
}

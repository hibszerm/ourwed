import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  adminSignInWithPassword,
  postPasswordDestination,
} from '@/admin/auth/adminAuthService'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import styles from '@/admin/styles/admin.module.css'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const { decision, refreshAuthorization } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (decision.kind === 'authorized') {
    return <Navigate to="/overview" replace />
  }
  if (decision.kind === 'mfa_setup') {
    return <Navigate to="/mfa/setup" replace />
  }
  if (decision.kind === 'mfa_verify') {
    return <Navigate to="/mfa/verify" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await adminSignInWithPassword({ email, password })
      if (!result.ok) {
        if (result.reason === 'unauthorized') {
          navigate('/unauthorized', { replace: true })
          return
        }
        if (result.reason === 'rate_limited') {
          setError('Zbyt wiele prób. Spróbuj ponownie za chwilę.')
          return
        }
        setError('Nieprawidłowy e-mail lub hasło.')
        return
      }
      await refreshAuthorization()
      navigate(postPasswordDestination(result.assurance), { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${styles.page} ${styles.authCenter}`} data-testid="admin-login">
      <form className={`${styles.authCard} ${styles.sans}`} onSubmit={onSubmit}>
        <h1 className={styles.brand}>OurWed Platform</h1>
        <p className={styles.lead}>Panel operacyjny OurWed</p>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.field}>
          <label htmlFor="admin-email">Adres e-mail</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={loading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="admin-password">Hasło</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            disabled={loading}
          />
        </div>

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Logowanie…' : 'Zaloguj się'}
        </button>

        <p className={styles.hint}>
          Dostęp wyłącznie dla uprawnionego administratora.
        </p>
      </form>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import {
  challengeAndVerifyTotp,
  listVerifiedTotpFactors,
} from '@/admin/lib/adminMfa'
import styles from '@/admin/styles/admin.module.css'

export function AdminMfaVerifyPage() {
  const navigate = useNavigate()
  const { decision, refreshAuthorization, signOut } = useAdminAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const factors = await listVerifiedTotpFactors()
        if (cancelled) return
        if (factors.length === 0) {
          navigate('/mfa/setup', { replace: true })
          return
        }
        setFactorId(factors[0]!.id)
      } catch {
        if (!cancelled) setBootError('Nie udało się wczytać czynników MFA.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (decision.kind === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  if (decision.kind === 'unauthorized') {
    return <Navigate to="/unauthorized" replace />
  }
  if (decision.kind === 'authorized') {
    return <Navigate to="/overview" replace />
  }
  if (decision.kind === 'mfa_setup') {
    return <Navigate to="/mfa/setup" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setLoading(true)
    setError(null)
    try {
      await challengeAndVerifyTotp({ factorId, code })
      await appendAdminAuditEvent({ action: 'admin.mfa_verification_succeeded' })
      await refreshAuthorization()
      navigate('/overview', { replace: true })
    } catch {
      setError('Nieprawidłowy kod weryfikacyjny.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${styles.page} ${styles.authCenter}`} data-testid="admin-mfa-verify">
      <form className={`${styles.authCard} ${styles.sans}`} onSubmit={onSubmit}>
        <h1 className={styles.brand}>Weryfikacja dwuetapowa</h1>
        <p className={styles.lead}>
          Wpisz kod z aplikacji uwierzytelniającej.
        </p>

        {bootError ? <p className={styles.error}>{bootError}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.field}>
          <label htmlFor="mfa-verify-code">Kod</label>
          <input
            id="mfa-verify-code"
            className={styles.codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={loading || !factorId}
          />
        </div>

        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={loading || !factorId || code.length !== 6}
        >
          {loading ? 'Weryfikacja…' : 'Potwierdź'}
        </button>

        <button
          type="button"
          className={styles.secondaryBtn}
          style={{ width: '100%', marginTop: '0.85rem' }}
          onClick={() => void signOut()}
        >
          Wyloguj
        </button>
      </form>
    </div>
  )
}

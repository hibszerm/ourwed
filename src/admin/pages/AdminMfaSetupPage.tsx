import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import {
  MFA_SETUP_USER_ERROR,
  logMfaSetupError,
  prepareTotpSetup,
  verifyTotpEnrollment,
  type PrepareTotpSetupPhase,
  type TotpEnrollment,
} from '@/admin/lib/adminMfa'
import { fetchAuthenticatorAssurance } from '@/admin/lib/adminAuthorization'
import styles from '@/admin/styles/admin.module.css'

function phaseLabel(phase: PrepareTotpSetupPhase): string {
  switch (phase) {
    case 'checking':
      return 'Sprawdzanie konfiguracji…'
    case 'cleaning':
      return 'Usuwanie niedokończonej konfiguracji…'
    case 'enrolling':
      return 'Przygotowywanie kodu QR…'
    default:
      return 'Przygotowywanie kodu QR…'
  }
}

export function AdminMfaSetupPage() {
  const navigate = useNavigate()
  const { decision, refreshAuthorization, signOut } = useAdminAuth()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [phase, setPhase] = useState<PrepareTotpSetupPhase>('checking')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [showBackup, setShowBackup] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const result = await prepareTotpSetup({
          onPhase: (next) => {
            if (!cancelled) setPhase(next)
          },
        })
        if (cancelled) return

        if (result.kind === 'redirect_verify') {
          navigate('/mfa/verify', { replace: true })
          return
        }

        setEnrollment(result.enrollment)
        setPhase('ready')
      } catch (err) {
        logMfaSetupError(err)
        if (!cancelled) {
          setBootError(MFA_SETUP_USER_ERROR)
          setPhase('error')
        }
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setLoading(true)
    setError(null)
    try {
      await verifyTotpEnrollment({
        factorId: enrollment.factorId,
        code,
      })
      setEnrollment((prev) =>
        prev ? { ...prev, secret: '', qrCode: '', uri: '' } : null,
      )
      await appendAdminAuditEvent({ action: 'admin.mfa_enrollment_completed' })
      await refreshAuthorization()
      const assurance = await fetchAuthenticatorAssurance()
      if (assurance.currentLevel !== 'aal2') {
        setError(MFA_SETUP_USER_ERROR)
        return
      }
      setShowBackup(true)
      window.setTimeout(() => {
        navigate('/overview', { replace: true })
      }, 1800)
    } catch (err) {
      logMfaSetupError(err)
      setError('Nieprawidłowy kod weryfikacyjny.')
    } finally {
      setLoading(false)
    }
  }

  const preparing = !enrollment && !bootError

  return (
    <div className={`${styles.page} ${styles.authCenter}`} data-testid="admin-mfa-setup">
      <form className={`${styles.authCard} ${styles.sans}`} onSubmit={onSubmit}>
        <h1 className={styles.brand}>Zabezpiecz konto administratora</h1>
        <p className={styles.lead}>
          Zeskanuj kod QR w aplikacji uwierzytelniającej.
        </p>
        <p className={styles.hint} style={{ marginTop: 0, marginBottom: '1rem' }}>
          Rekomendowane: 1Password, Google Authenticator, Authy lub Apple
          Passwords.
        </p>

        {bootError ? (
          <p className={styles.error} role="alert" data-testid="admin-mfa-setup-error">
            {bootError}
          </p>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {enrollment?.qrCode ? (
          <div
            className={styles.qrWrap}
            dangerouslySetInnerHTML={{ __html: enrollment.qrCode }}
            aria-label="Kod QR TOTP"
            data-testid="admin-mfa-qr"
          />
        ) : preparing ? (
          <p className={styles.hint} data-testid="admin-mfa-setup-phase">
            {phaseLabel(phase)}
          </p>
        ) : null}

        {enrollment?.secret ? (
          <p className={styles.secretBox} data-testid="admin-totp-secret">
            {enrollment.secret}
          </p>
        ) : null}

        <div className={styles.field}>
          <label htmlFor="mfa-setup-code">Kod weryfikacyjny</label>
          <input
            id="mfa-setup-code"
            className={styles.codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={loading || !enrollment}
          />
        </div>

        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={loading || !enrollment || code.length !== 6}
        >
          {loading ? 'Weryfikacja…' : 'Potwierdź i kontynuuj'}
        </button>

        {showBackup ? (
          <p className={styles.backupNote}>
            Dodaj zapasowy czynnik TOTP w innym bezpiecznym miejscu.
          </p>
        ) : null}

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

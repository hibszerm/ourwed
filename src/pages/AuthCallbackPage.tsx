import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  exchangeAuthCodeOnce,
  isTokenHashRecovery,
  mapAuthCallbackFailureMessage,
  parseAuthCallbackParams,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
  verifyRecoveryTokenHashOnce,
  type AuthCallbackResult,
} from '@/features/auth/callback/authCallback'
import styles from '@/features/auth/components/AuthForms.module.css'

type Phase =
  | { kind: 'loading' }
  | {
      kind: 'confirm_recovery'
      tokenHash: string
    }
  | {
      kind: 'error'
      message: string
      next: ReturnType<typeof parseAuthCallbackParams>['next']
    }
  | { kind: 'done'; path: string; state?: Record<string, unknown> }

/** Survives StrictMode remounts for PKCE codes / token hashes already started. */
const startedKeys = new Set<string>()

/**
 * Single entry for Supabase Auth email callbacks.
 *
 * Recovery (token_hash): waits for an explicit user click before verifyOtp
 * (guards against email-client link prefetch consuming the token).
 *
 * Legacy PKCE (?code=): exchanges once, then routes by intent.
 */
export function AuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearPasswordRecovery, armPasswordRecovery } = useAuth()
  const startedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const params = parseAuthCallbackParams(location.search)

    async function finishFromResult(
      result: AuthCallbackResult,
      next: typeof params.next,
    ) {
      if (!result.ok) {
        setPhase({
          kind: 'error',
          message: result.message,
          next,
        })
        return
      }

      const isRecovery = result.isRecovery || next === 'recovery'
      const destination = resolveAuthCallbackDestination({
        next,
        isRecovery,
        hasSession: Boolean(result.session),
      })

      if (isRecovery) {
        armPasswordRecovery()
      } else {
        clearPasswordRecovery()
      }

      // Strip sensitive callback params from the address bar.
      window.history.replaceState({}, '', '/auth/callback')

      setPhase({
        kind: 'done',
        path: destination.path,
        state: destination.state,
      })
    }

    async function runLegacyPkce() {
      if (params.error) {
        setPhase({
          kind: 'error',
          message: mapAuthCallbackFailureMessage('provider_error'),
          next: params.next,
        })
        return
      }

      if (!params.code) {
        setPhase({
          kind: 'error',
          message: mapAuthCallbackFailureMessage('missing_code'),
          next: params.next,
        })
        return
      }

      const key = `code:${params.code}`
      if (!startedKeys.has(key)) {
        startedKeys.add(key)
      }

      let result: AuthCallbackResult
      try {
        result = await exchangeAuthCodeOnce(params.code)
      } catch {
        setPhase({
          kind: 'error',
          message: mapAuthCallbackFailureMessage('exchange_failed'),
          next: params.next,
        })
        return
      }

      await finishFromResult(result, params.next)
    }

    // Priority: token_hash recovery (cross-device) over legacy PKCE code.
    if (isTokenHashRecovery(params) && params.tokenHash) {
      setPhase({ kind: 'confirm_recovery', tokenHash: params.tokenHash })
      return
    }

    if (params.type === 'recovery' && !params.tokenHash) {
      setPhase({
        kind: 'error',
        message: mapAuthCallbackFailureMessage('missing_token'),
        next: 'recovery',
      })
      return
    }

    if (params.tokenHash && params.type && params.type !== 'recovery') {
      setPhase({
        kind: 'error',
        message: mapAuthCallbackFailureMessage('invalid_type'),
        next: params.next,
      })
      return
    }

    if (params.tokenHash && !params.type) {
      setPhase({
        kind: 'error',
        message: mapAuthCallbackFailureMessage('invalid_type'),
        next: params.next,
      })
      return
    }

    void runLegacyPkce()
  }, [armPasswordRecovery, clearPasswordRecovery, location.search])

  async function confirmRecovery(tokenHash: string) {
    if (verifying) return
    setVerifying(true)

    const key = `token:${tokenHash}`
    if (!startedKeys.has(key)) {
      startedKeys.add(key)
    }

    let result: AuthCallbackResult
    try {
      result = await verifyRecoveryTokenHashOnce(tokenHash)
    } catch {
      setPhase({
        kind: 'error',
        message: mapAuthCallbackFailureMessage('verify_failed'),
        next: 'recovery',
      })
      setVerifying(false)
      return
    }

    if (!result.ok) {
      setPhase({
        kind: 'error',
        message: result.message,
        next: 'recovery',
      })
      setVerifying(false)
      return
    }

    armPasswordRecovery()
    window.history.replaceState({}, '', '/auth/callback')
    setPhase({
      kind: 'done',
      path: '/reset-password',
    })
  }

  useEffect(() => {
    if (phase.kind !== 'done') return
    navigate(phase.path, { replace: true, state: phase.state })
  }, [navigate, phase])

  if (phase.kind === 'done') {
    return <Navigate to={phase.path} replace state={phase.state} />
  }

  if (phase.kind === 'confirm_recovery') {
    return (
      <AuthShell
        title="Reset hasła"
        subtitle="Potwierdź, że chcesz ustawić nowe hasło do konta OurWed."
        footer={<Link to="/login">Wróć do logowania</Link>}
      >
        <div className={styles.successPanel}>
          <p className={styles.successBody}>
            Kliknij poniżej, aby kontynuować. Ten krok chroni przed
            automatycznym otwieraniem linków przez skrzynki e-mail.
          </p>
          <Button
            type="button"
            variant="primary"
            className={styles.submit}
            disabled={verifying}
            onClick={() => void confirmRecovery(phase.tokenHash)}
          >
            {verifying ? 'Weryfikacja…' : 'Kontynuuj reset hasła'}
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (phase.kind === 'error') {
    const action = resolveAuthCallbackErrorAction(phase.next)
    return (
      <AuthShell
        title="Link wygasł lub został już użyty"
        subtitle="Poproś o nowy link albo wróć do logowania."
        footer={<Link to="/login">Wróć do logowania</Link>}
      >
        <div className={styles.successPanel}>
          <p className={styles.successBody}>{phase.message}</p>
          <p className={styles.successBody}>
            <Link to={action.to}>{action.label}</Link>
          </p>
        </div>
      </AuthShell>
    )
  }

  return <AuthLoadingScreen label="Trwa weryfikacja…" />
}

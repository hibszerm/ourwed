import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  exchangeAuthCodeOnce,
  mapAuthCallbackFailureMessage,
  parseAuthCallbackParams,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
  type AuthCallbackExchangeResult,
} from '@/features/auth/callback/authCallback'
import styles from '@/features/auth/components/AuthForms.module.css'

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; next: ReturnType<typeof parseAuthCallbackParams>['next'] }
  | { kind: 'done'; path: string; state?: Record<string, unknown> }

/**
 * Single entry for all Supabase Auth email PKCE callbacks.
 * Exchanges ?code= exactly once, then routes by intent.
 */
export function AuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearPasswordRecovery, armPasswordRecovery } = useAuth()
  const startedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const params = parseAuthCallbackParams(location.search)

    async function run() {
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

      let result: AuthCallbackExchangeResult
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

      if (!result.ok) {
        setPhase({
          kind: 'error',
          message: result.message,
          next: params.next,
        })
        return
      }

      const isRecovery = result.isRecovery || params.next === 'recovery'
      const destination = resolveAuthCallbackDestination({
        next: params.next,
        isRecovery,
        hasSession: Boolean(result.session),
      })

      if (isRecovery) {
        armPasswordRecovery()
      } else {
        clearPasswordRecovery()
      }

      // Strip sensitive query params from the address bar before navigating away.
      window.history.replaceState({}, '', '/auth/callback')

      setPhase({
        kind: 'done',
        path: destination.path,
        state: destination.state,
      })
    }

    void run()
  }, [armPasswordRecovery, clearPasswordRecovery, location.search])

  useEffect(() => {
    if (phase.kind !== 'done') return
    navigate(phase.path, { replace: true, state: phase.state })
  }, [navigate, phase])

  if (phase.kind === 'done') {
    return <Navigate to={phase.path} replace state={phase.state} />
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

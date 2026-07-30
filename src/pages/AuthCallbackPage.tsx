import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  exchangeAuthCodeOnce,
  getConfirmCopyForIntent,
  isTokenHashCallback,
  mapAuthCallbackFailureMessage,
  parseAuthCallbackParams,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
  resolveTokenHashFlow,
  verifyAuthTokenHashOnce,
  type AuthCallbackIntent,
  type AuthCallbackResult,
  type AuthConfirmCopy,
} from '@/features/auth/callback/authCallback'
import styles from '@/features/auth/components/AuthForms.module.css'

type Phase =
  | { kind: 'loading' }
  | {
      kind: 'confirm'
      tokenHash: string
      intent: AuthCallbackIntent
      verificationType: Parameters<
        typeof verifyAuthTokenHashOnce
      >[0]['verificationType']
      copy: AuthConfirmCopy
    }
  | {
      kind: 'error'
      message: string
      intentOrNext: AuthCallbackIntent | ReturnType<
        typeof parseAuthCallbackParams
      >['next']
    }
  | { kind: 'done'; path: string; state?: Record<string, unknown> }

/** Survives StrictMode remounts for tokens / codes already started. */
const startedKeys = new Set<string>()

/**
 * Single entry for Supabase Auth email callbacks.
 *
 * Token-hash flows: intent-specific confirm click, then verifyOtp once.
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
      intent: AuthCallbackIntent | null,
    ) {
      if (!result.ok) {
        setPhase({
          kind: 'error',
          message: result.message,
          intentOrNext: intent ?? next,
        })
        return
      }

      const resolvedIntent = result.intent ?? intent
      const isRecovery =
        result.isRecovery ||
        resolvedIntent === 'recovery' ||
        next === 'recovery'
      const destination = resolveAuthCallbackDestination({
        next,
        isRecovery,
        hasSession: Boolean(result.session),
        intent: resolvedIntent,
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
          intentOrNext: params.next,
        })
        return
      }

      if (!params.code) {
        setPhase({
          kind: 'error',
          message: mapAuthCallbackFailureMessage('missing_code'),
          intentOrNext: params.next,
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
          intentOrNext: params.next,
        })
        return
      }

      await finishFromResult(result, params.next, params.intent)
    }

    // Priority: token_hash (all intents) over legacy PKCE code.
    if (isTokenHashCallback(params)) {
      const resolved = resolveTokenHashFlow(params)
      if (!resolved.ok) {
        setPhase({
          kind: 'error',
          message: resolved.message,
          intentOrNext: params.intent ?? params.next,
        })
        return
      }

      setPhase({
        kind: 'confirm',
        tokenHash: resolved.tokenHash,
        intent: resolved.intent,
        verificationType: resolved.verificationType,
        copy: resolved.confirm,
      })
      return
    }

    void runLegacyPkce()
  }, [armPasswordRecovery, clearPasswordRecovery, location.search])

  async function confirmTokenHash(phaseConfirm: Extract<Phase, { kind: 'confirm' }>) {
    if (verifying) return
    setVerifying(true)

    const key = `token:${phaseConfirm.verificationType}:${phaseConfirm.tokenHash}`
    if (!startedKeys.has(key)) {
      startedKeys.add(key)
    }

    let result: AuthCallbackResult
    try {
      result = await verifyAuthTokenHashOnce({
        tokenHash: phaseConfirm.tokenHash,
        verificationType: phaseConfirm.verificationType,
        intent: phaseConfirm.intent,
      })
    } catch {
      setPhase({
        kind: 'error',
        message: mapAuthCallbackFailureMessage('verify_failed'),
        intentOrNext: phaseConfirm.intent,
      })
      setVerifying(false)
      return
    }

    if (!result.ok) {
      setPhase({
        kind: 'error',
        message: result.message,
        intentOrNext: phaseConfirm.intent,
      })
      setVerifying(false)
      return
    }

    if (phaseConfirm.intent === 'recovery') {
      armPasswordRecovery()
    } else {
      clearPasswordRecovery()
    }

    window.history.replaceState({}, '', '/auth/callback')

    const destination = resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: phaseConfirm.intent === 'recovery',
      hasSession: Boolean(result.session),
      intent: phaseConfirm.intent,
    })

    setPhase({
      kind: 'done',
      path: destination.path,
      state: destination.state,
    })
  }

  useEffect(() => {
    if (phase.kind !== 'done') return
    navigate(phase.path, { replace: true, state: phase.state })
  }, [navigate, phase])

  if (phase.kind === 'done') {
    return <Navigate to={phase.path} replace state={phase.state} />
  }

  if (phase.kind === 'confirm') {
    const copy = phase.copy ?? getConfirmCopyForIntent(phase.intent)
    return (
      <AuthShell
        title={copy.title}
        subtitle={copy.subtitle}
        footer={<Link to="/login">Wróć do logowania</Link>}
      >
        <div className={styles.successPanel}>
          <p className={styles.successBody}>{copy.body}</p>
          <Button
            type="button"
            variant="primary"
            className={styles.submit}
            disabled={verifying}
            onClick={() => void confirmTokenHash(phase)}
          >
            {verifying ? copy.verifyingLabel : copy.buttonLabel}
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (phase.kind === 'error') {
    const action = resolveAuthCallbackErrorAction(phase.intentOrNext)
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

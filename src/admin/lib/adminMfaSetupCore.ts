/**
 * Pure MFA setup pipeline — no Supabase module import (test-safe).
 */

import { devErrorArgs } from '@/lib/debug/devConsole'
export type TotpEnrollment = {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

export type TotpFactorSummary = {
  id: string
  status: string
  factor_type?: string
  factorType?: string
  friendly_name?: string | null
  friendlyName?: string | null
}

export type PrepareTotpSetupResult =
  | { kind: 'redirect_verify'; verifiedFactorId: string }
  | { kind: 'enrolled'; enrollment: TotpEnrollment }

export type PrepareTotpSetupPhase =
  | 'checking'
  | 'cleaning'
  | 'enrolling'
  | 'ready'
  | 'redirect'
  | 'error'

export const MFA_SETUP_USER_ERROR =
  'Nie udało się przygotować uwierzytelniania dwuskładnikowego. Spróbuj ponownie.'

export type MfaClient = {
  listFactors: () => Promise<{
    data: {
      totp?: TotpFactorSummary[] | null
      all?: TotpFactorSummary[] | null
    } | null
    error: Error | null
  }>
  unenroll: (args: { factorId: string }) => Promise<{ error: Error | null }>
  enroll: (args: {
    factorType: 'totp'
    friendlyName?: string
  }) => Promise<{
    data: {
      id: string
      totp: { qr_code: string; secret: string; uri: string }
    } | null
    error: Error | null
  }>
}

function factorTypeOf(f: TotpFactorSummary): string {
  return (f.factor_type ?? f.factorType ?? 'totp').toLowerCase()
}

/** Classify TOTP factors by status/id — never by friendly_name alone. */
export function partitionTotpFactors(factors: TotpFactorSummary[]): {
  verified: TotpFactorSummary[]
  unverified: TotpFactorSummary[]
} {
  const totp = factors.filter((f) => factorTypeOf(f) === 'totp')
  return {
    verified: totp.filter((f) => f.status === 'verified'),
    unverified: totp.filter((f) => f.status !== 'verified'),
  }
}

let setupInFlight: Promise<PrepareTotpSetupResult> | null = null
/** Keeps QR/secret across StrictMode remounts within the same JS session. */
let sessionEnrollment: TotpEnrollment | null = null

/**
 * Idempotent MFA setup pipeline.
 * Concurrent callers share one in-flight promise (StrictMode-safe).
 */
export async function prepareTotpSetup(options: {
  client: MfaClient
  friendlyName?: string
  onPhase?: (phase: PrepareTotpSetupPhase) => void
}): Promise<PrepareTotpSetupResult> {
  if (setupInFlight) return setupInFlight

  const client = options.client
  const friendlyName = options.friendlyName ?? 'OurWed Admin'
  const onPhase = options.onPhase

  setupInFlight = (async () => {
    try {
      onPhase?.('checking')
      const listed = await client.listFactors()
      if (listed.error) throw listed.error

      const factors = [
        ...(listed.data?.totp ?? []),
        ...((listed.data?.all ?? []).filter(
          (f) => factorTypeOf(f) === 'totp',
        ) as TotpFactorSummary[]),
      ]
      const byId = new Map<string, TotpFactorSummary>()
      for (const f of factors) byId.set(f.id, f)
      const { verified, unverified } = partitionTotpFactors([...byId.values()])

      if (verified.length > 0) {
        sessionEnrollment = null
        onPhase?.('redirect')
        return {
          kind: 'redirect_verify',
          verifiedFactorId: verified[0]!.id,
        }
      }

      if (sessionEnrollment) {
        const stillOpen = unverified.some(
          (f) => f.id === sessionEnrollment!.factorId,
        )
        if (stillOpen) {
          onPhase?.('ready')
          return { kind: 'enrolled', enrollment: sessionEnrollment }
        }
        sessionEnrollment = null
      }

      if (unverified.length > 0) {
        onPhase?.('cleaning')
        for (const factor of unverified) {
          if (factor.status === 'verified') continue
          const { error } = await client.unenroll({ factorId: factor.id })
          if (error) throw error
        }
      }

      onPhase?.('enrolling')
      const enrolled = await client.enroll({
        factorType: 'totp',
        friendlyName,
      })
      if (enrolled.error || !enrolled.data) {
        throw enrolled.error ?? new Error('enroll failed')
      }

      const enrollment: TotpEnrollment = {
        factorId: enrolled.data.id,
        qrCode: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
        uri: enrolled.data.totp.uri,
      }
      sessionEnrollment = enrollment
      onPhase?.('ready')
      return { kind: 'enrolled', enrollment }
    } catch (err) {
      onPhase?.('error')
      throw err
    } finally {
      setupInFlight = null
    }
  })()

  return setupInFlight
}

export function clearSessionEnrollment(): void {
  sessionEnrollment = null
}

/** Test helper — clear in-flight guard and session cache between cases. */
export function resetTotpSetupInFlightForTests(): void {
  setupInFlight = null
  sessionEnrollment = null
}

export function logMfaSetupError(err: unknown): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const message = err instanceof Error ? err.message : String(err)
    devErrorArgs(
      '[admin-mfa-setup]',
      message.replace(/secret[=:]\S+/gi, '[redacted]'),
    )
  }
}

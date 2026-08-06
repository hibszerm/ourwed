import { supabase } from '@/lib/supabase'
import {
  clearSessionEnrollment,
  partitionTotpFactors,
  prepareTotpSetup as prepareTotpSetupCore,
  type MfaClient,
  type PrepareTotpSetupPhase,
  type PrepareTotpSetupResult,
} from '@/admin/lib/adminMfaSetupCore'

export type {
  MfaClient,
  PrepareTotpSetupPhase,
  PrepareTotpSetupResult,
  TotpEnrollment,
  TotpFactorSummary,
} from '@/admin/lib/adminMfaSetupCore'

export {
  MFA_SETUP_USER_ERROR,
  clearSessionEnrollment,
  logMfaSetupError,
  partitionTotpFactors,
  resetTotpSetupInFlightForTests,
} from '@/admin/lib/adminMfaSetupCore'

function defaultMfaClient(): MfaClient {
  return {
    listFactors: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      return { data, error: error as Error | null }
    },
    unenroll: async ({ factorId }) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      return { error: error as Error | null }
    },
    enroll: async (args) => {
      const { data, error } = await supabase.auth.mfa.enroll(args)
      return {
        data: data
          ? {
              id: data.id,
              totp: {
                qr_code: data.totp.qr_code,
                secret: data.totp.secret,
                uri: data.totp.uri,
              },
            }
          : null,
        error: error as Error | null,
      }
    },
  }
}

export async function prepareTotpSetup(options?: {
  client?: MfaClient
  friendlyName?: string
  onPhase?: (phase: PrepareTotpSetupPhase) => void
}): Promise<PrepareTotpSetupResult> {
  return prepareTotpSetupCore({
    client: options?.client ?? defaultMfaClient(),
    friendlyName: options?.friendlyName,
    onPhase: options?.onPhase,
  })
}

export async function listVerifiedTotpFactors(
  client: MfaClient = defaultMfaClient(),
) {
  const { data, error } = await client.listFactors()
  if (error) throw error
  const { verified } = partitionTotpFactors(data?.totp ?? [])
  return verified
}

export async function hasVerifiedTotpFactor(): Promise<boolean> {
  const factors = await listVerifiedTotpFactors()
  return factors.length > 0
}

export async function verifyTotpEnrollment(input: {
  factorId: string
  code: string
}): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({
    factorId: input.factorId,
  })
  if (challenge.error || !challenge.data) {
    throw challenge.error ?? new Error('Nie udało się utworzyć wyzwania MFA.')
  }

  const verified = await supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: challenge.data.id,
    code: input.code.trim(),
  })
  if (verified.error) {
    throw verified.error
  }
  clearSessionEnrollment()
}

export async function challengeAndVerifyTotp(input: {
  factorId: string
  code: string
}): Promise<void> {
  return verifyTotpEnrollment(input)
}

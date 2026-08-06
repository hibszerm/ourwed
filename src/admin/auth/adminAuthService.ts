import { supabase } from '@/lib/supabase'
import {
  fetchAdminSessionStatus,
  fetchAuthenticatorAssurance,
  isEnabledOwner,
  type AdminAssurance,
  type AdminSessionStatus,
} from '@/admin/lib/adminAuthorization'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'

export type AdminLoginResult =
  | {
      ok: true
      status: AdminSessionStatus
      assurance: AdminAssurance
    }
  | { ok: false; reason: 'invalid_credentials' | 'unauthorized' | 'rate_limited' }

/**
 * Password sign-in for admin. Generic errors only.
 * Non-owners are signed out immediately.
 */
export async function adminSignInWithPassword(input: {
  email: string
  password: string
}): Promise<AdminLoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('rate') || error.status === 429) {
      return { ok: false, reason: 'rate_limited' }
    }
    return { ok: false, reason: 'invalid_credentials' }
  }

  if (!data.session) {
    return { ok: false, reason: 'invalid_credentials' }
  }

  const status = await fetchAdminSessionStatus()
  if (!isEnabledOwner(status)) {
    await supabase.auth.signOut()
    return { ok: false, reason: 'unauthorized' }
  }

  const assurance = await fetchAuthenticatorAssurance()
  await appendAdminAuditEvent({
    action: 'admin.login_succeeded',
    metadata: {
      aal: assurance.currentLevel,
      next: assurance.nextLevel,
    },
  })

  return { ok: true, status, assurance }
}

export function postPasswordDestination(assurance: AdminAssurance): string {
  const current = assurance.currentLevel
  const next = assurance.nextLevel
  if (current === 'aal2') return '/overview'
  if (current === 'aal1' && next === 'aal2') return '/mfa/verify'
  return '/mfa/setup'
}

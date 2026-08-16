import { supabase } from '@/lib/supabase'
import {
  type AdminAssurance,
  type AdminSessionStatus,
} from '@/admin/lib/adminAccessDecision'
import { devErrorArgs } from '@/lib/debug/devConsole'

export type {
  AdminAccessDecision,
  AdminAssurance,
  AdminRole,
  AdminSessionStatus,
} from '@/admin/lib/adminAccessDecision'

export {
  decideAdminAccess,
  isEnabledOwner,
} from '@/admin/lib/adminAccessDecision'

const EMPTY_STATUS: AdminSessionStatus = {
  isAdmin: false,
  enabled: false,
  role: null,
}

/**
 * Server-evaluated admin status for the authenticated user.
 * Uses security-definer RPC — never accepts a client-supplied user_id.
 */
export async function fetchAdminSessionStatus(): Promise<AdminSessionStatus> {
  const { data, error } = await supabase.rpc('get_admin_session_status')
  if (error) {
    devErrorArgs('[admin] get_admin_session_status failed', error.message)
    return EMPTY_STATUS
  }

  const raw = (data ?? {}) as Record<string, unknown>
  const role = raw.role === 'owner' ? 'owner' : null
  return {
    isAdmin: Boolean(raw.isAdmin),
    enabled: Boolean(raw.enabled),
    role,
  }
}

export async function fetchAuthenticatorAssurance(): Promise<AdminAssurance> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) {
    return { currentLevel: 'aal1', nextLevel: 'aal1' }
  }
  return {
    currentLevel: data.currentLevel ?? 'aal1',
    nextLevel: data.nextLevel ?? null,
  }
}

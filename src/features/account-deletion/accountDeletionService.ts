import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { markLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import { resetTenantClientState } from '@/lib/auth/resetTenantClientState'
import {
  ACCOUNT_DELETED_QUERY,
  AccountDeletionError,
  type AccountDeletionErrorCode,
  type DeleteAccountResult,
} from '@/features/account-deletion/accountDeletionTypes'
import { messageForAccountDeletionError } from '@/features/account-deletion/accountDeletionMessages'

const DELETE_ACCOUNT_FN = 'delete-account'

type EdgeErrorBody = {
  ok?: boolean
  error?: { code?: string; message?: string }
}

const KNOWN_CODES = new Set<AccountDeletionErrorCode>([
  'AUTH_REQUIRED',
  'REAUTH_FAILED',
  'REAUTH_METHOD_UNAVAILABLE',
  'RATE_LIMITED',
  'ADMIN_DELETION_BLOCKED',
  'CALENDAR_LOCAL_CLEANUP_FAILED',
  'DATABASE_ERASURE_FAILED',
  'STORAGE_ERASURE_FAILED',
  'AUTH_ERASURE_FAILED',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
])

function normalizeCode(raw: string | undefined): AccountDeletionErrorCode {
  if (raw && KNOWN_CODES.has(raw as AccountDeletionErrorCode)) {
    return raw as AccountDeletionErrorCode
  }
  return 'UNKNOWN'
}

function errorFromPayload(payload: EdgeErrorBody | null): AccountDeletionError {
  const code = normalizeCode(payload?.error?.code)
  return new AccountDeletionError(code, messageForAccountDeletionError(code), {
    retryable: code !== 'ADMIN_DELETION_BLOCKED' && code !== 'REAUTH_METHOD_UNAVAILABLE',
  })
}

/**
 * Clear account/session-scoped OurWed client artifacts.
 * Preserves global UI preferences (appearance / theme / interface-style / list view modes).
 */
export function clearAccountScopedClientStorage(userId: string | null | undefined): void {
  try {
    const remove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('ourwed:')) continue

      // Preserve global presentation preferences (not account-bound).
      if (
        key === 'ourwed:appearance' ||
        key === 'ourwed:theme-id' ||
        key === 'ourwed:interface-style' ||
        key === 'ourwed:weddings-view-mode' ||
        key === 'ourwed:sessions-view-mode' ||
        key === 'ourwed:calendar-view-mode'
      ) {
        continue
      }

      if (userId && key.includes(userId)) {
        remove.push(key)
        continue
      }
      if (key.startsWith('ourwed:appearance:u:')) remove.push(key)
      if (key.startsWith('ourwed:theme-id:u:')) remove.push(key)
      if (key.startsWith('ourwed:interface-style:u:')) remove.push(key)
      if (key.startsWith('ourwed:prewedding-share-token:')) remove.push(key)
      if (key.startsWith('ourwed:wedding-import-mapping:')) remove.push(key)
      if (key.startsWith('ourwed:ai-contract')) remove.push(key)
      if (key === 'ourwed:calendar-backfill-pending') remove.push(key)
      if (key === 'ourwed:ai-contract-lab-wedding-id') remove.push(key)
      if (key === 'ourwed:wedding-detail-v2-tab') remove.push(key)
    }
    for (const key of remove) localStorage.removeItem(key)
  } catch {
    // ignore quota / private mode
  }

  try {
    sessionStorage.removeItem('ourwed:afterLogout')
  } catch {
    // ignore
  }
}

async function sessionStillAuthenticated(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.id) return false
    return true
  } catch {
    return false
  }
}

/**
 * Complete local teardown after verified account deletion, then hard-navigate home.
 * Uses location.replace so protected app memory cannot linger.
 */
export async function finalizeAccountDeletionClient(userId: string | null | undefined): Promise<void> {
  clearAccountScopedClientStorage(userId)
  resetTenantClientState()
  markLogoutRedirectToLanding()
  try {
    await supabase.auth.signOut()
  } catch {
    // Session may already be invalid after Auth delete — continue.
  }
  resetTenantClientState()
  window.location.replace(`/?${ACCOUNT_DELETED_QUERY}=1`)
}

/**
 * Call delete-account Edge Function with password only (never userId).
 * Handles ambiguous network outcomes via getUser() (does not weaken auth).
 */
export async function requestAccountDeletion(
  password: string,
): Promise<DeleteAccountResult> {
  const trimmed = password
  if (!trimmed) {
    return {
      status: 'failed',
      error: new AccountDeletionError(
        'REAUTH_FAILED',
        messageForAccountDeletionError('REAUTH_FAILED'),
        { retryable: true },
      ),
    }
  }

  let priorUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    priorUserId = data.user?.id ?? null
  } catch {
    priorUserId = null
  }

  try {
    const { data, error } = await supabase.functions.invoke(DELETE_ACCOUNT_FN, {
      body: { password: trimmed },
    })

    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body = (await error.context.json().catch(() => null)) as EdgeErrorBody | null
        return { status: 'failed', error: errorFromPayload(body) }
      }
      if (error instanceof FunctionsFetchError) {
        const stillHere = await sessionStillAuthenticated()
        if (!stillHere) {
          await finalizeAccountDeletionClient(priorUserId)
          return { status: 'completed' }
        }
        return {
          status: 'failed',
          error: new AccountDeletionError(
            'NETWORK_AMBIGUOUS',
            messageForAccountDeletionError('NETWORK_AMBIGUOUS'),
            { retryable: true },
          ),
        }
      }
      return {
        status: 'failed',
        error: new AccountDeletionError(
          'INTERNAL_ERROR',
          messageForAccountDeletionError('INTERNAL_ERROR'),
          { retryable: true },
        ),
      }
    }

    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
      await finalizeAccountDeletionClient(priorUserId)
      return { status: 'completed' }
    }

    if (data && typeof data === 'object' && (data as EdgeErrorBody).ok === false) {
      return { status: 'failed', error: errorFromPayload(data as EdgeErrorBody) }
    }

    // Unexpected payload — check whether Auth already completed.
    const stillHere = await sessionStillAuthenticated()
    if (!stillHere) {
      await finalizeAccountDeletionClient(priorUserId)
      return { status: 'completed' }
    }

    return {
      status: 'failed',
      error: new AccountDeletionError(
        'INTERNAL_ERROR',
        messageForAccountDeletionError('INTERNAL_ERROR'),
        { retryable: true },
      ),
    }
  } catch {
    const stillHere = await sessionStillAuthenticated()
    if (!stillHere) {
      await finalizeAccountDeletionClient(priorUserId)
      return { status: 'completed' }
    }
    return {
      status: 'failed',
      error: new AccountDeletionError(
        'NETWORK_AMBIGUOUS',
        messageForAccountDeletionError('NETWORK_AMBIGUOUS'),
        { retryable: true },
      ),
    }
  }
}

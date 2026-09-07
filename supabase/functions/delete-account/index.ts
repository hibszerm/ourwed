/**
 * delete-account — permanent OurWed account erasure (Phase 2A.3 production hardening).
 *
 * REMOTE SUPABASE TARGET (sole hosted project):
 *   xyycwllsovpxlcustpcv — live OurWed infrastructure (production-like).
 * Controlled QA must use synthetic disposable accounts only.
 *
 * Order (invariant):
 * 1) Authenticate JWT (user id from session only — never from body)
 * 2) Passwordless / missing email → REAUTH_METHOD_UNAVAILABLE
 * 3) Per-user rate limit (service-role RPC)
 * 4) Password re-auth via ephemeral client (does not mutate caller session)
 * 5) Calendar: remote Google revoke BEST-EFFORT; LOCAL secret/hash clear MANDATORY
 * 6) RPC erase_account_data(userId) — CRM DB transaction
 * 7) Storage prefix cleanup until verified empty (document-files/{userId}/)
 * 8) auth.admin.deleteUser LAST
 *
 * If calendar-local, DB, or Storage fails → Auth is NOT deleted.
 *
 * Body: { password: string }
 * Success: { ok: true }
 *
 * Retry / Auth-already-gone:
 * - Backend cannot trust unauthenticated callers after Auth delete.
 * - If Auth user is already absent on admin.deleteUser, treat as success.
 * - Frontend Phase 2B: after a confirmed deletion attempt, invalid session
 *   should route to landing/login (likely completed), not a scary failure.
 *
 * P0 PAYMENT ACCOUNT-DELETION INTEGRATION — when PSP exists, cancel remote
 * subscription / retain invoices before Auth delete. Not implemented yet.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { decryptSecret } from '../_shared/calendar/cryptoDates.ts'
import {
  cleanupCalendarCredentials,
  CalendarLocalCleanupError,
  type CalendarCleanupDb,
} from './calendarCleanup.ts'
import {
  assertPrefixHasNoFiles,
  eraseStoragePrefixUntilEmpty,
  STORAGE_BUCKET,
  StorageErasureError,
  type StorageErasureAdapter,
} from './storageErasure.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'REAUTH_FAILED'
  | 'REAUTH_METHOD_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ADMIN_DELETION_BLOCKED'
  | 'CALENDAR_LOCAL_CLEANUP_FAILED'
  | 'DATABASE_ERASURE_FAILED'
  | 'STORAGE_ERASURE_FAILED'
  | 'AUTH_ERASURE_FAILED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse(
    { ok: false, error: { code, message, ...extra } },
    status,
  )
}

function env(name: string): string | null {
  return Deno.env.get(name)?.trim() || null
}

function googleClientSecret(): string | null {
  return (
    env('GOOGLE_CALENDAR_CLIENT_SECRET') ||
    env('GOOGLE_CALENDR_CLIENT_SECRET')
  )
}

function resolveTokenKey(): string {
  return (
    env('CALENDAR_TOKEN_ENCRYPTION_KEY') ||
    googleClientSecret() ||
    'local-dev-only-calendar-token-key'
  )
}

function createServiceClient(): SupabaseClient {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

function createUserClient(authHeader: string): SupabaseClient {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
}

/** Ephemeral anon client — password check must not affect the caller's session. */
function createEphemeralAnonClient(): SupabaseClient {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_ANON_KEY') ?? '',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

function logEvent(event: Record<string, unknown>): void {
  console.error(JSON.stringify(event))
}

function hasUsableEmailPassword(user: {
  email?: string | null
  identities?: Array<{ provider?: string }> | null
}): boolean {
  if (!user.email) return false
  const identities = user.identities
  if (!identities || identities.length === 0) {
    // Current OurWed signup is email/password; empty identities → allow attempt.
    return true
  }
  return identities.some((i) => i.provider === 'email')
}

function createStorageAdapter(service: SupabaseClient): StorageErasureAdapter {
  return {
    async list(prefix, opts) {
      const { data, error } = await service.storage
        .from(STORAGE_BUCKET)
        .list(prefix, { limit: opts.limit, offset: opts.offset })
      if (error) {
        if (/not found|does not exist/i.test(error.message)) {
          return { entries: [], notFound: true }
        }
        return { entries: [], error: error.message }
      }
      return {
        entries: (data ?? []).map((e) => ({
          name: e.name,
          id: e.id ?? null,
        })),
      }
    },
    async remove(paths) {
      const { error } = await service.storage.from(STORAGE_BUCKET).remove(paths)
      if (error) return { error: error.message }
      return {}
    },
  }
}

function createCalendarDb(service: SupabaseClient): CalendarCleanupDb {
  return {
    async findGoogleIntegration(userId) {
      const { data, error } = await service
        .from('calendar_integrations')
        .select('id, provider')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      if (error) {
        throw new CalendarLocalCleanupError(
          `google_integration_lookup_failed:${error.message}`,
        )
      }
      return data
    },
    async loadGoogleSecret(integrationId) {
      const { data, error } = await service
        .from('calendar_integration_secrets')
        .select('refresh_token_enc, access_token_enc')
        .eq('integration_id', integrationId)
        .maybeSingle()
      if (error) {
        throw new CalendarLocalCleanupError(
          `google_secret_lookup_failed:${error.message}`,
        )
      }
      return data
    },
    async deleteGoogleSecret(integrationId) {
      const { error } = await service
        .from('calendar_integration_secrets')
        .delete()
        .eq('integration_id', integrationId)
      return error ? { error: error.message } : {}
    },
    async clearGoogleIntegration(integrationId) {
      const { error } = await service
        .from('calendar_integrations')
        .update({
          enabled: false,
          google_account_email: null,
          google_account_id: null,
          google_calendar_id: null,
          google_calendar_name: null,
          google_connected_at: null,
          google_revoked_at: new Date().toISOString(),
          google_scopes: null,
          google_token_expires_at: null,
          last_error_code: null,
          last_error_at: null,
          last_error_message: null,
        })
        .eq('id', integrationId)
      return error ? { error: error.message } : {}
    },
    async clearAppleIntegration(userId) {
      const { error } = await service
        .from('calendar_integrations')
        .update({
          enabled: false,
          apple_token_hash: null,
          apple_feed_etag: null,
        })
        .eq('user_id', userId)
        .eq('provider', 'apple')
      return error ? { error: error.message } : {}
    },
    async deleteAllSecretsForUser(userId) {
      const { error } = await service
        .from('calendar_integration_secrets')
        .delete()
        .eq('user_id', userId)
      return error ? { error: error.message } : {}
    },
  }
}

async function revokeGoogleToken(token: string): Promise<void> {
  const res = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  // Google returns 200 even for already-revoked; non-2xx still best-effort.
  if (!res.ok) {
    throw new Error(`google_revoke_http_${res.status}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return errorResponse('BAD_REQUEST', 'POST required', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('AUTH_REQUIRED', 'Wymagane logowanie.', 401)
  }

  const supabaseUrl = env('SUPABASE_URL')
  const anonKey = env('SUPABASE_ANON_KEY')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse('INTERNAL_ERROR', 'Usługa tymczasowo niedostępna.', 503)
  }

  let password = ''
  try {
    const body = (await req.json()) as { password?: unknown; userId?: unknown }
    if (body.userId != null) {
      return errorResponse('BAD_REQUEST', 'Nieprawidłowe żądanie.', 400)
    }
    if (typeof body.password !== 'string' || body.password.length === 0) {
      return errorResponse('REAUTH_FAILED', 'Potwierdź hasłem.', 401)
    }
    password = body.password
  } catch {
    return errorResponse('BAD_REQUEST', 'Nieprawidłowe żądanie.', 400)
  }

  const userClient = createUserClient(authHeader)
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user?.id) {
    return errorResponse('AUTH_REQUIRED', 'Sesja wygasła.', 401)
  }
  const userId = user.id

  if (!hasUsableEmailPassword(user)) {
    return errorResponse(
      'REAUTH_METHOD_UNAVAILABLE',
      'Usuwanie konta wymaga hasła. To konto nie obsługuje potwierdzenia hasłem.',
      400,
    )
  }
  const email = user.email!

  const service = createServiceClient()

  // Rate limit before password attempt (counts wrong-password retries).
  const { data: rlData, error: rlErr } = await service.rpc(
    'account_deletion_rate_limit_consume',
    {
      p_user_id: userId,
      p_window_seconds: 900,
      p_max_attempts: 5,
    },
  )
  if (rlErr) {
    logEvent({
      scope: 'delete-account',
      step: 'rate_limit',
      ok: false,
      code: rlErr.code ?? null,
    })
    return errorResponse(
      'INTERNAL_ERROR',
      'Usługa tymczasowo niedostępna.',
      503,
    )
  }
  const rl = rlData as {
    allowed?: boolean
    retry_after_seconds?: number
  } | null
  if (!rl || rl.allowed !== true) {
    return errorResponse(
      'RATE_LIMITED',
      'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
      429,
      {
        retry_after_seconds:
          typeof rl?.retry_after_seconds === 'number'
            ? rl.retry_after_seconds
            : 900,
      },
    )
  }

  // Re-auth: ephemeral client — does not replace the caller's browser session.
  const ephemeral = createEphemeralAnonClient()
  const { data: reauthData, error: reauthErr } =
    await ephemeral.auth.signInWithPassword({ email, password })
  try {
    await ephemeral.auth.signOut()
  } catch {
    /* ignore */
  }
  password = ''

  if (
    reauthErr ||
    !reauthData.user?.id ||
    reauthData.user.id !== userId
  ) {
    return errorResponse('REAUTH_FAILED', 'Nieprawidłowe hasło.', 401)
  }

  // Calendar: remote revoke best-effort; local clear mandatory before DB/Auth.
  try {
    await cleanupCalendarCredentials(userId, {
      db: createCalendarDb(service),
      decryptSecret,
      resolveTokenKey,
      revokeGoogleToken,
      log: logEvent,
    })
  } catch (err) {
    logEvent({
      scope: 'delete-account',
      step: 'calendar_local',
      ok: false,
      reason: err instanceof Error ? err.message : 'unknown',
    })
    return errorResponse(
      'CALENDAR_LOCAL_CLEANUP_FAILED',
      'Nie udało się unieważnić integracji kalendarza. Spróbuj ponownie.',
      500,
    )
  }

  // CRM erasure (service_role RPC). Idempotent if already erased.
  const { data: eraseResult, error: eraseErr } = await service.rpc(
    'erase_account_data',
    { p_user_id: userId },
  )
  if (eraseErr) {
    const msg = eraseErr.message ?? ''
    if (/sole_admin_blocked/i.test(msg)) {
      return errorResponse(
        'ADMIN_DELETION_BLOCKED',
        'Nie można usunąć jedynego konta administratora platformy.',
        403,
      )
    }
    logEvent({
      scope: 'delete-account',
      step: 'database',
      ok: false,
      code: eraseErr.code ?? null,
    })
    return errorResponse(
      'DATABASE_ERASURE_FAILED',
      'Nie udało się usunąć danych konta. Spróbuj ponownie.',
      500,
    )
  }
  if (!eraseResult || (eraseResult as { ok?: boolean }).ok !== true) {
    return errorResponse(
      'DATABASE_ERASURE_FAILED',
      'Nie udało się usunąć danych konta. Spróbuj ponownie.',
      500,
    )
  }

  // Storage — must succeed + verify empty before Auth delete.
  const storage = createStorageAdapter(service)
  try {
    await eraseStoragePrefixUntilEmpty(storage, userId)
    // Defense in depth: explicit final verification (also done inside erase).
    await assertPrefixHasNoFiles(storage, userId)
  } catch (err) {
    logEvent({
      scope: 'delete-account',
      step: 'storage',
      ok: false,
      reason: err instanceof Error ? err.message : 'unknown',
      code: err instanceof StorageErasureError ? err.code : 'STORAGE_ERASURE_FAILED',
    })
    return errorResponse(
      'STORAGE_ERASURE_FAILED',
      'Nie udało się usunąć plików. Spróbuj ponownie.',
      500,
    )
  }

  // Auth Admin delete — ABSOLUTELY LAST
  const { error: authDelErr } = await service.auth.admin.deleteUser(userId)
  if (authDelErr) {
    const alreadyGone = /not found|user not found|does not exist/i.test(
      authDelErr.message,
    )
    if (alreadyGone) {
      // Idempotent success: prior attempt completed Auth delete.
      return jsonResponse({ ok: true, already_deleted: true })
    }
    logEvent({
      scope: 'delete-account',
      step: 'auth',
      ok: false,
      reason: authDelErr.message,
    })
    return errorResponse(
      'AUTH_ERASURE_FAILED',
      'Dane zostały usunięte, ale finalizacja konta wymaga ponowienia. Spróbuj ponownie.',
      500,
    )
  }

  return jsonResponse({ ok: true })
})

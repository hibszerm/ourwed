import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  logCalendar,
  pkceChallenge,
  randomPkceVerifier,
  randomToken,
  encryptSecret,
} from '../_shared/calendar/cryptoDates.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'openid',
  'email',
].join(' ')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

function env(name: string): string | null {
  const raw = Deno.env.get(name)?.trim()
  return raw || null
}

/**
 * Client secret with a one-time typo alias.
 * Observed misconfiguration: GOOGLE_CALENDR_CLIENT_SECRET (missing A in CALENDAR).
 */
function googleClientSecret(): string | null {
  const correct = env('GOOGLE_CALENDAR_CLIENT_SECRET')
  if (correct) return correct
  const typo = env('GOOGLE_CALENDR_CLIENT_SECRET')
  if (typo) {
    logCalendar('warn', 'oauth_secret_typo_alias', {
      provider: 'google',
      operation: 'env',
      expected: 'GOOGLE_CALENDAR_CLIENT_SECRET',
      actual: 'GOOGLE_CALENDR_CLIENT_SECRET',
    })
    return typo
  }
  return null
}

function resolveTokenKey(): string {
  return (
    env('CALENDAR_TOKEN_ENCRYPTION_KEY') ||
    googleClientSecret() ||
    'local-dev-only-calendar-token-key'
  )
}

function createServiceClient() {
  const url = env('SUPABASE_URL') ?? ''
  const key = env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(url, key)
}

function createUserClient(authHeader: string) {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
}

function appPublicUrl(): string {
  return (
    env('APP_PUBLIC_URL') ||
    env('SITE_URL') ||
    'http://localhost:5173'
  ).replace(/\/$/, '')
}

function oauthRedirectUri(): string {
  const explicit = env('GOOGLE_CALENDAR_REDIRECT_URI')
  if (explicit) return explicit
  const supabaseUrl = (env('SUPABASE_URL') ?? '').replace(/\/$/, '')
  return `${supabaseUrl}/functions/v1/google-calendar-oauth/callback`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const isCallback =
    url.pathname.endsWith('/callback') ||
    url.searchParams.has('code') ||
    url.searchParams.has('error')

  if (req.method === 'GET' && isCallback) {
    return handleCallback(url)
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401)
  }

  const userClient = createUserClient(authHeader)
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401)
  }

  let body: { action?: string; redirectPath?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  if (body.action !== 'start') {
    return errorResponse('INVALID_ACTION', 'Unknown action')
  }

  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID')
  if (!clientId) {
    return errorResponse(
      'GOOGLE_NOT_CONFIGURED',
      'Google Calendar nie jest skonfigurowane. Ustaw GOOGLE_CALENDAR_CLIENT_ID.',
      503,
    )
  }

  const state = randomToken(24)
  const verifier = randomPkceVerifier()
  const challenge = await pkceChallenge(verifier)
  const redirectPath = body.redirectPath || '/ustawienia/integracje'
  const service = createServiceClient()

  const { error: stateError } = await service.from('calendar_oauth_states').insert({
    state,
    user_id: userData.user.id,
    code_verifier: verifier,
    redirect_path: redirectPath,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })

  if (stateError) {
    logCalendar('error', 'oauth_state_insert_failed', {
      provider: 'google',
      operation: 'start',
      errorCategory: 'db',
    })
    return errorResponse('OAUTH_STATE_FAILED', 'Nie udało się rozpocząć OAuth.')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  logCalendar('info', 'oauth_start', {
    provider: 'google',
    operation: 'start',
    userId: userData.user.id,
  })

  return jsonResponse({ ok: true, url: authUrl })
})

async function handleCallback(url: URL): Promise<Response> {
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const appUrl = appPublicUrl()

  if (error || !code || !state) {
    const dest = `${appUrl}/ustawienia/integracje?google=error`
    return Response.redirect(dest, 302)
  }

  const service = createServiceClient()
  const { data: stateRow, error: stateErr } = await service
    .from('calendar_oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle()

  if (stateErr || !stateRow) {
    return Response.redirect(
      `${appUrl}/ustawienia/integracje?google=invalid_state`,
      302,
    )
  }

  await service.from('calendar_oauth_states').delete().eq('state', state)

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return Response.redirect(
      `${appUrl}/ustawienia/integracje?google=expired_state`,
      302,
    )
  }

  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID')
  const clientSecret = googleClientSecret()
  if (!clientId || !clientSecret) {
    logCalendar('error', 'oauth_callback_missing_env', {
      provider: 'google',
      operation: 'callback',
      errorCategory: 'config',
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      missing: [
        !clientId ? 'GOOGLE_CALENDAR_CLIENT_ID' : null,
        !clientSecret ? 'GOOGLE_CALENDAR_CLIENT_SECRET' : null,
      ].filter(Boolean),
    })
    return Response.redirect(
      `${appUrl}/ustawienia/integracje?google=not_configured`,
      302,
    )
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthRedirectUri(),
      grant_type: 'authorization_code',
      code_verifier: stateRow.code_verifier,
    }),
  })

  if (!tokenRes.ok) {
    logCalendar('error', 'oauth_token_exchange_failed', {
      provider: 'google',
      operation: 'callback',
      errorCategory: 'token_exchange',
      status: tokenRes.status,
    })
    return Response.redirect(
      `${appUrl}/ustawienia/integracje?google=token_failed`,
      302,
    )
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
  }

  let accountEmail: string | null = null
  let accountId: string | null = null
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string; id?: string }
      accountEmail = info.email ?? null
      accountId = info.id ?? null
    }
  } catch {
    // optional
  }

  let primaryCalendarId = 'primary'
  let primaryCalendarName = 'Kalendarz główny'
  try {
    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
    )
    if (calRes.ok) {
      const calJson = (await calRes.json()) as {
        items?: Array<{
          id: string
          summary?: string
          primary?: boolean
        }>
      }
      const primary =
        calJson.items?.find((c) => c.primary) ?? calJson.items?.[0]
      if (primary) {
        primaryCalendarId = primary.id
        primaryCalendarName = primary.summary || primaryCalendarId
      }
    }
  } catch {
    // keep defaults
  }

  const userId = stateRow.user_id as string
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : null

  const { data: existing } = await service
    .from('calendar_integrations')
    .select('id, sync_weddings, sync_sessions, backfill_mode')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()

  const integrationPayload = {
    user_id: userId,
    provider: 'google',
    enabled: true,
    sync_weddings: existing?.sync_weddings ?? true,
    sync_sessions: existing?.sync_sessions ?? true,
    backfill_mode: existing?.backfill_mode ?? 'future',
    google_account_email: accountEmail,
    google_account_id: accountId,
    google_calendar_id: primaryCalendarId,
    google_calendar_name: primaryCalendarName,
    google_connected_at: new Date().toISOString(),
    google_revoked_at: null,
    google_scopes: (tokenJson.scope ?? GOOGLE_SCOPES).split(/\s+/).filter(Boolean),
    google_token_expires_at: expiresAt,
    last_error_code: null,
    last_error_at: null,
    last_error_message: null,
  }

  let integrationId = existing?.id as string | undefined
  if (integrationId) {
    await service
      .from('calendar_integrations')
      .update(integrationPayload)
      .eq('id', integrationId)
  } else {
    const { data: inserted, error: insertErr } = await service
      .from('calendar_integrations')
      .insert(integrationPayload)
      .select('id')
      .single()
    if (insertErr || !inserted) {
      logCalendar('error', 'oauth_integration_insert_failed', {
        provider: 'google',
        operation: 'callback',
        errorCategory: 'db',
      })
      return Response.redirect(
        `${appUrl}/ustawienia/integracje?google=persist_failed`,
        302,
      )
    }
    integrationId = inserted.id
  }

  const key = resolveTokenKey()
  const accessEnc = await encryptSecret(tokenJson.access_token, key)
  const refreshEnc = tokenJson.refresh_token
    ? await encryptSecret(tokenJson.refresh_token, key)
    : null

  const { data: existingSecret } = await service
    .from('calendar_integration_secrets')
    .select('refresh_token_enc')
    .eq('integration_id', integrationId)
    .maybeSingle()

  await service.from('calendar_integration_secrets').upsert({
    integration_id: integrationId,
    user_id: userId,
    provider: 'google',
    access_token_enc: accessEnc,
    refresh_token_enc: refreshEnc ?? existingSecret?.refresh_token_enc ?? null,
    token_type: tokenJson.token_type ?? 'Bearer',
    raw_expires_at: expiresAt,
  })

  // Enqueue initial backfill
  await service.from('calendar_sync_jobs').insert({
    user_id: userId,
    entity_type: 'integration',
    entity_id: integrationId,
    provider: 'google',
    operation: 'backfill',
    status: 'pending',
    payload_json: {},
  })

  logCalendar('info', 'oauth_connected', {
    provider: 'google',
    operation: 'callback',
    integrationId,
    userId,
  })

  const redirectPath =
    (stateRow.redirect_path as string) || '/ustawienia/integracje'
  return Response.redirect(
    `${appUrl}${redirectPath}?google=connected`,
    302,
  )
}

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  buildSessionCanonical,
  buildWeddingCanonical,
  type CategorySettings,
} from '../_shared/calendar/canonical.ts'
import {
  decryptSecret,
  encryptSecret,
  logCalendar,
  randomToken,
  sha256Hex,
  type CanonicalEvent,
} from '../_shared/calendar/cryptoDates.ts'
import {
  deleteGoogleEvent,
  enqueueCoalescedJob,
  findOwnedGoogleEvents,
  googleFetch,
  normalizeCalendarId,
  ourwedPrivateProps,
  reconcileEntityDuplicates,
  reserveMapping,
} from '../_shared/calendar/syncCore.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
  return Deno.env.get(name)?.trim() || null
}

/** Prefer correct name; accept observed typo GOOGLE_CALENDR_CLIENT_SECRET. */
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

function createServiceClient() {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

function createUserClient(authHeader: string) {
  return createClient(
    env('SUPABASE_URL') ?? '',
    env('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
}

function appPublicUrl(): string {
  return (env('APP_PUBLIC_URL') || env('SITE_URL') || 'http://localhost:5173')
    .replace(/\/$/, '')
}

function feedBaseUrl(): string {
  const supabaseUrl = (env('SUPABASE_URL') ?? '').replace(/\/$/, '')
  return `${supabaseUrl}/functions/v1/apple-calendar-feed`
}

function appleWebcalUrl(rawToken: string): string {
  const https = `${feedBaseUrl()}/${rawToken}/ourwed.ics`
  return https.replace(/^https:/i, 'webcal:')
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^webcal:/i, 'https:'))
    const parts = parsed.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p.length > 20)
    if (idx >= 0) {
      const t = parts[idx]
      parts[idx] = `${t.slice(0, 4)}…${t.slice(-4)}`
      parsed.pathname = '/' + parts.join('/')
    }
    return parsed.toString().replace(/^https:/i, 'webcal:')
  } catch {
    return 'webcal://••••/ourwed.ics'
  }
}

type IntegrationRow = Record<string, unknown>

function categorySettings(row: IntegrationRow): CategorySettings {
  return {
    syncWeddings: Boolean(row.sync_weddings ?? true),
    syncSessions: Boolean(row.sync_sessions ?? true),
    backfillMode: (row.backfill_mode as 'future' | 'all_active') ?? 'future',
  }
}

async function getAccessToken(
  service: SupabaseClient,
  integration: IntegrationRow,
): Promise<{ token: string } | { error: string }> {
  const { data: secret } = await service
    .from('calendar_integration_secrets')
    .select('*')
    .eq('integration_id', integration.id)
    .maybeSingle()

  if (!secret?.access_token_enc) {
    return { error: 'google_revoked' }
  }

  const key = resolveTokenKey()
  let access = await decryptSecret(secret.access_token_enc, key)
  const expiresAt = secret.raw_expires_at
    ? new Date(secret.raw_expires_at).getTime()
    : 0

  if (expiresAt && expiresAt < Date.now() + 60_000) {
    if (!secret.refresh_token_enc) {
      return { error: 'google_auth_expired' }
    }
    const refresh = await decryptSecret(secret.refresh_token_enc, key)
    const clientId = env('GOOGLE_CALENDAR_CLIENT_ID')
    const clientSecret = googleClientSecret()
    if (!clientId || !clientSecret) return { error: 'google_not_configured' }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    })

    if (!tokenRes.ok) {
      const status = tokenRes.status
      const errCode =
        status === 400 || status === 401
          ? 'google_revoked'
          : 'google_temp_failure'
      await service
        .from('calendar_integrations')
        .update({
          google_revoked_at:
            errCode === 'google_revoked' ? new Date().toISOString() : null,
          last_error_code: errCode,
          last_error_at: new Date().toISOString(),
          last_error_message:
            errCode === 'google_revoked'
              ? 'Połączenie z Google Calendar wygasło. Połącz konto ponownie.'
              : 'Tymczasowy błąd odświeżania tokenu Google.',
        })
        .eq('id', integration.id)
      return { error: errCode }
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string
      expires_in?: number
      refresh_token?: string
    }
    access = tokenJson.access_token
    const newExpires = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
      : null
    await service
      .from('calendar_integration_secrets')
      .update({
        access_token_enc: await encryptSecret(access, key),
        refresh_token_enc: tokenJson.refresh_token
          ? await encryptSecret(tokenJson.refresh_token, key)
          : secret.refresh_token_enc,
        raw_expires_at: newExpires,
      })
      .eq('integration_id', integration.id)
    await service
      .from('calendar_integrations')
      .update({
        google_token_expires_at: newExpires,
        google_revoked_at: null,
      })
      .eq('id', integration.id)
  }

  return { token: access }
}

async function finalizeMapping(
  service: SupabaseClient,
  userId: string,
  calendarId: string,
  event: CanonicalEvent,
  googleEvent: { id: string; htmlLink?: string },
) {
  await service.from('external_calendar_events').upsert(
    {
      user_id: userId,
      provider: 'google',
      entity_type: event.entityType,
      entity_id: event.entityId,
      external_calendar_id: calendarId,
      external_event_id: googleEvent.id,
      external_event_url: googleEvent.htmlLink ?? null,
      source_fingerprint: event.fingerprint,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error_code: null,
      last_error_at: null,
    },
    {
      onConflict:
        'user_id,provider,entity_type,entity_id,external_calendar_id',
    },
  )
}

async function createOrAdoptGoogleEvent(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  accessToken: string,
  event: CanonicalEvent,
  calendarIdRaw: string,
  calendarPathId: string,
): Promise<'created' | 'updated' | 'failed'> {
  const calendarId = normalizeCalendarId(calendarIdRaw)
  const reservation = await reserveMapping(service, {
    userId,
    entityType: event.entityType,
    entityId: event.entityId,
    calendarId,
    fingerprint: event.fingerprint,
  })

  if (reservation.status === 'conflict') {
    // Another worker is creating — wait briefly and adopt if present
    await new Promise((r) => setTimeout(r, 750))
    const owned = await findOwnedGoogleEvents(
      accessToken,
      calendarPathId,
      event.entityType,
      event.entityId,
    )
    if (owned.length >= 1) {
      const keep = owned[0]
      await finalizeMapping(service, userId, calendarId, event, {
        id: keep.id,
        htmlLink: keep.htmlLink,
      })
      for (const extra of owned.slice(1)) {
        await deleteGoogleEvent(accessToken, calendarPathId, extra.id)
      }
      return 'updated'
    }
    return 'failed'
  }

  if (reservation.status === 'exists') {
    const existingId = String(reservation.mapping.external_event_id ?? '')
    if (
      existingId &&
      reservation.mapping.source_fingerprint === event.fingerprint &&
      reservation.mapping.sync_status === 'synced'
    ) {
      return 'updated'
    }
    if (existingId) {
      const body = {
        summary: event.title,
        start: { date: event.startDate },
        end: { date: event.endDateExclusive },
        extendedProperties: {
          private: ourwedPrivateProps(event, userId),
        },
      }
      const patchRes = await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarPathId)}/events/${encodeURIComponent(existingId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      )
      if (patchRes.ok) {
        const eventJson = (await patchRes.json()) as {
          id: string
          htmlLink?: string
        }
        await finalizeMapping(service, userId, calendarId, event, eventJson)
        return 'updated'
      }
      if (patchRes.status === 404 || patchRes.status === 410) {
        // Event-specific missing — fall through to adopt/create
      } else if (patchRes.status === 401 || patchRes.status === 403) {
        await markAuthError(service, integration, patchRes.status)
        return 'failed'
      } else {
        return 'failed'
      }
    }
  }

  // Adopt any existing owned event before creating
  const owned = await findOwnedGoogleEvents(
    accessToken,
    calendarPathId,
    event.entityType,
    event.entityId,
  )
  if (owned.length > 0) {
    const keep = [...owned].sort((a, b) =>
      String(a.created ?? '').localeCompare(String(b.created ?? '')),
    )[0]
    const body = {
      summary: event.title,
      start: { date: event.startDate },
      end: { date: event.endDateExclusive },
      extendedProperties: {
        private: ourwedPrivateProps(event, userId),
      },
    }
    await googleFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarPathId)}/events/${encodeURIComponent(keep.id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    )
    await finalizeMapping(service, userId, calendarId, event, {
      id: keep.id,
      htmlLink: keep.htmlLink,
    })
    for (const extra of owned) {
      if (extra.id === keep.id) continue
      await deleteGoogleEvent(accessToken, calendarPathId, extra.id)
    }
    return 'updated'
  }

  const createRes = await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarPathId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: event.title,
        start: { date: event.startDate },
        end: { date: event.endDateExclusive },
        extendedProperties: {
          private: ourwedPrivateProps(event, userId),
        },
      }),
    },
  )

  if (createRes.status === 401 || createRes.status === 403) {
    await markAuthError(service, integration, createRes.status)
    return 'failed'
  }
  if (createRes.status === 404) {
    await service
      .from('calendar_integrations')
      .update({
        last_error_code: 'calendar_unavailable',
        last_error_at: new Date().toISOString(),
        last_error_message:
          'Wybrany kalendarz nie jest już dostępny. Wybierz inny kalendarz.',
      })
      .eq('id', integration.id)
    return 'failed'
  }
  if (!createRes.ok) {
    logCalendar('warn', 'google_create_failed', {
      provider: 'google',
      operation: 'create',
      entityType: event.entityType,
      entityId: event.entityId,
      status: createRes.status,
    })
    await upsertMappingError(
      service,
      userId,
      integration,
      event,
      `http_${createRes.status}`,
    )
    return 'failed'
  }

  const eventJson = (await createRes.json()) as {
    id: string
    htmlLink?: string
  }
  await finalizeMapping(service, userId, calendarId, event, eventJson)
  return 'created'
}

async function upsertGoogleEvent(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  accessToken: string,
  event: CanonicalEvent,
): Promise<'created' | 'updated' | 'failed' | 'omitted'> {
  if (!event.eligible) {
    await removeGoogleEventIfMapped(
      service,
      userId,
      integration,
      accessToken,
      event.entityType,
      event.entityId,
    )
    return 'omitted'
  }

  const calendarIdRaw = normalizeCalendarId(
    integration.google_calendar_id as string | null,
  )
  // API path: use literal "primary" when stored as primary; else the real id
  const calendarPathId =
    calendarIdRaw === 'primary'
      ? 'primary'
      : String(integration.google_calendar_id || 'primary')

  const { data: mapping } = await service
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('entity_type', event.entityType)
    .eq('entity_id', event.entityId)
    .eq('external_calendar_id', calendarIdRaw)
    .maybeSingle()

  if (
    mapping?.external_event_id &&
    mapping.source_fingerprint === event.fingerprint &&
    mapping.sync_status === 'synced'
  ) {
    return 'updated'
  }

  if (mapping?.external_event_id) {
    const body = {
      summary: event.title,
      start: { date: event.startDate },
      end: { date: event.endDateExclusive },
      extendedProperties: {
        private: ourwedPrivateProps(event, userId),
      },
    }
    const patchRes = await googleFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarPathId)}/events/${encodeURIComponent(mapping.external_event_id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    )
    if (patchRes.ok) {
      const eventJson = (await patchRes.json()) as {
        id: string
        htmlLink?: string
      }
      await finalizeMapping(service, userId, calendarIdRaw, event, eventJson)
      return 'updated'
    }
    if (patchRes.status === 401 || patchRes.status === 403) {
      await markAuthError(service, integration, patchRes.status)
      return 'failed'
    }
    if (patchRes.status === 404 || patchRes.status === 410) {
      // Event-specific missing: heal by adopt/create (not calendar-level failure)
      logCalendar('info', 'google_event_404_heal', {
        provider: 'google',
        operation: 'patch',
        entityType: event.entityType,
        entityId: event.entityId,
        status: patchRes.status,
      })
      await service
        .from('external_calendar_events')
        .update({
          sync_status: 'pending',
          external_event_id: null,
          external_event_url: null,
          last_error_code: 'event_missing',
        })
        .eq('id', mapping.id)
      return createOrAdoptGoogleEvent(
        service,
        userId,
        integration,
        accessToken,
        event,
        calendarIdRaw,
        calendarPathId,
      )
    }
    return 'failed'
  }

  return createOrAdoptGoogleEvent(
    service,
    userId,
    integration,
    accessToken,
    event,
    calendarIdRaw,
    calendarPathId,
  )
}

async function removeGoogleEventIfMapped(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  accessToken: string,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const calendarIdRaw = String(integration.google_calendar_id || 'primary')
  const { data: mapping } = await service
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (!mapping?.external_event_id) return false

  const calendarId = encodeURIComponent(
    mapping.external_calendar_id || calendarIdRaw,
  )
  const res = await googleFetch(
    accessToken,
    `/calendars/${calendarId}/events/${encodeURIComponent(mapping.external_event_id)}`,
    { method: 'DELETE' },
  )

  if (res.ok || res.status === 404 || res.status === 410) {
    await service
      .from('external_calendar_events')
      .update({
        sync_status: 'deleted',
        external_event_id: null,
        external_event_url: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', mapping.id)
    return true
  }
  return false
}

async function markAuthError(
  service: SupabaseClient,
  integration: IntegrationRow,
  status: number,
) {
  await service
    .from('calendar_integrations')
    .update({
      google_revoked_at: new Date().toISOString(),
      last_error_code: status === 401 ? 'google_revoked' : 'google_auth_expired',
      last_error_at: new Date().toISOString(),
      last_error_message:
        'Połączenie z Google Calendar wygasło. Połącz konto ponownie.',
    })
    .eq('id', integration.id)
}

async function upsertMappingError(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  event: CanonicalEvent,
  code: string,
) {
  await service.from('external_calendar_events').upsert(
    {
      user_id: userId,
      provider: 'google',
      entity_type: event.entityType,
      entity_id: event.entityId,
      external_calendar_id: integration.google_calendar_id || 'primary',
      source_fingerprint: event.fingerprint,
      sync_status: 'error',
      last_error_code: code,
      last_error_at: new Date().toISOString(),
    },
    {
      onConflict:
        'user_id,provider,entity_type,entity_id,external_calendar_id',
    },
  )
}

async function loadWeddingCanonical(
  service: SupabaseClient,
  userId: string,
  weddingId: string,
  settings: CategorySettings,
): Promise<CanonicalEvent | null> {
  const { data } = await service
    .from('weddings')
    .select(
      'id, wedding_date, status, display_name, bride_name, groom_name',
    )
    .eq('id', weddingId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return buildWeddingCanonical(data, settings)
}

async function loadSessionCanonical(
  service: SupabaseClient,
  userId: string,
  sessionId: string,
  settings: CategorySettings,
): Promise<CanonicalEvent | null> {
  const { data } = await service
    .from('sessions')
    .select(
      'id, session_date, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type',
    )
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return buildSessionCanonical(data, settings)
}

async function syncEntity(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  accessToken: string,
  entityType: 'wedding' | 'session',
  entityId: string,
  operation: 'upsert' | 'delete',
): Promise<'created' | 'updated' | 'failed' | 'omitted' | 'deleted'> {
  const settings = categorySettings(integration)

  if (operation === 'delete') {
    const removed = await removeGoogleEventIfMapped(
      service,
      userId,
      integration,
      accessToken,
      entityType,
      entityId,
    )
    return removed ? 'deleted' : 'omitted'
  }

  const event =
    entityType === 'wedding'
      ? await loadWeddingCanonical(service, userId, entityId, settings)
      : await loadSessionCanonical(service, userId, entityId, settings)

  if (!event) {
    await removeGoogleEventIfMapped(
      service,
      userId,
      integration,
      accessToken,
      entityType,
      entityId,
    )
    return 'deleted'
  }

  return upsertGoogleEvent(service, userId, integration, accessToken, event)
}

async function syncNow(
  service: SupabaseClient,
  userId: string,
  integration: IntegrationRow,
  accessToken: string,
): Promise<{
  synced: number
  updated: number
  failed: number
  omitted: number
  deleted: number
}> {
  const settings = categorySettings(integration)
  const result = {
    synced: 0,
    updated: 0,
    failed: 0,
    omitted: 0,
    deleted: 0,
  }

  const { data: weddings } = await service
    .from('weddings')
    .select(
      'id, wedding_date, status, display_name, bride_name, groom_name',
    )
    .eq('user_id', userId)

  const { data: sessions } = await service
    .from('sessions')
    .select(
      'id, session_date, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type',
    )
    .eq('user_id', userId)

  const eligibleIds = new Set<string>()

  for (const w of weddings ?? []) {
    const event = buildWeddingCanonical(w, settings)
    const key = `wedding:${w.id}`
    const outcome = await upsertGoogleEvent(
      service,
      userId,
      integration,
      accessToken,
      event,
    )
    if (event.eligible) eligibleIds.add(key)
    if (outcome === 'created') result.synced += 1
    else if (outcome === 'updated') result.updated += 1
    else if (outcome === 'failed') result.failed += 1
    else if (outcome === 'omitted') result.omitted += 1
  }

  for (const s of sessions ?? []) {
    const event = buildSessionCanonical(s, settings)
    const key = `session:${s.id}`
    const outcome = await upsertGoogleEvent(
      service,
      userId,
      integration,
      accessToken,
      event,
    )
    if (event.eligible) eligibleIds.add(key)
    if (outcome === 'created') result.synced += 1
    else if (outcome === 'updated') result.updated += 1
    else if (outcome === 'failed') result.failed += 1
    else if (outcome === 'omitted') result.omitted += 1
  }

  // Remove obsolete mappings for entities no longer eligible / present
  const { data: mappings } = await service
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .neq('sync_status', 'deleted')

  for (const m of mappings ?? []) {
    const key = `${m.entity_type}:${m.entity_id}`
    if (!eligibleIds.has(key) && m.external_event_id) {
      const removed = await removeGoogleEventIfMapped(
        service,
        userId,
        integration,
        accessToken,
        m.entity_type,
        m.entity_id,
      )
      if (removed) result.deleted += 1
    }
  }

  await service
    .from('calendar_integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      last_error_code: result.failed > 0 ? 'partial_sync_failure' : null,
      last_error_at: result.failed > 0 ? new Date().toISOString() : null,
      last_error_message:
        result.failed > 0
          ? 'Część wydarzeń nie została zsynchronizowana.'
          : null,
    })
    .eq('id', integration.id)

  return result
}

async function processJobs(
  service: SupabaseClient,
  userId: string,
): Promise<{ processed: number }> {
  const { data: integration } = await service
    .from('calendar_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('enabled', true)
    .maybeSingle()

  if (!integration || integration.google_revoked_at) {
    return { processed: 0 }
  }

  const tokenResult = await getAccessToken(service, integration)
  if ('error' in tokenResult) return { processed: 0 }

  const { data: jobs } = await service
    .from('calendar_sync_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(20)

  let processed = 0
  for (const job of jobs ?? []) {
    // Exclusive claim — only one worker may process a pending job
    const { data: claimed } = await service
      .from('calendar_sync_jobs')
      .update({
        status: 'running',
        locked_at: new Date().toISOString(),
        attempt_count: (job.attempt_count ?? 0) + 1,
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    try {
      if (job.operation === 'backfill' || job.operation === 'sync_now') {
        await syncNow(service, userId, integration, tokenResult.token)
      } else if (
        (job.operation === 'upsert' || job.operation === 'delete') &&
        job.entity_id &&
        (job.entity_type === 'wedding' || job.entity_type === 'session')
      ) {
        await syncEntity(
          service,
          userId,
          integration,
          tokenResult.token,
          job.entity_type,
          job.entity_id,
          job.operation,
        )
      } else if (job.operation === 'disconnect_cleanup') {
        // handled in disconnect
      }

      await service
        .from('calendar_sync_jobs')
        .update({ status: 'succeeded', last_error_code: null })
        .eq('id', job.id)
      processed += 1
    } catch (err) {
      const attempt = (job.attempt_count ?? 0) + 1
      const permanent = attempt >= 8
      const backoffMin = Math.min(60, 2 ** Math.min(attempt, 5))
      await service
        .from('calendar_sync_jobs')
        .update({
          status: permanent ? 'failed' : 'pending',
          next_attempt_at: new Date(
            Date.now() + backoffMin * 60_000,
          ).toISOString(),
          last_error_code: 'temp_failure',
          last_error_message:
            err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        })
        .eq('id', job.id)
      logCalendar('warn', 'job_retry', {
        provider: 'google',
        operation: job.operation,
        entityType: job.entity_type,
        entityId: job.entity_id,
        attemptNumber: attempt,
        errorCategory: permanent ? 'permanent' : 'temporary',
      })
    }
  }

  return { processed }
}

function mapGoogleView(row: IntegrationRow | null) {
  if (!row) {
    return {
      provider: 'google' as const,
      connected: false,
      enabled: false,
      accountEmail: null,
      calendarId: null,
      calendarName: null,
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'future' as const,
      connectedAt: null,
      revokedAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      needsReconnect: false,
      needsCalendarAttention: false,
    }
  }
  const needsReconnect =
    Boolean(row.google_revoked_at) ||
    row.last_error_code === 'google_revoked' ||
    row.last_error_code === 'google_auth_expired'
  return {
    provider: 'google' as const,
    connected: Boolean(row.google_connected_at) && !needsReconnect,
    enabled: Boolean(row.enabled),
    accountEmail: (row.google_account_email as string) ?? null,
    calendarId: (row.google_calendar_id as string) ?? null,
    calendarName: (row.google_calendar_name as string) ?? null,
    syncWeddings: Boolean(row.sync_weddings),
    syncSessions: Boolean(row.sync_sessions),
    backfillMode: (row.backfill_mode as 'future' | 'all_active') ?? 'future',
    connectedAt: (row.google_connected_at as string) ?? null,
    revokedAt: (row.google_revoked_at as string) ?? null,
    lastSyncAt: (row.last_sync_at as string) ?? null,
    lastErrorCode: (row.last_error_code as string) ?? null,
    lastErrorAt: (row.last_error_at as string) ?? null,
    lastErrorMessage: (row.last_error_message as string) ?? null,
    needsReconnect,
    needsCalendarAttention:
      row.last_error_code === 'calendar_unavailable' ||
      row.last_error_code === 'calendar_not_writable',
  }
}

function mapAppleView(
  row: IntegrationRow | null,
  rawToken: string | null = null,
) {
  if (!row) {
    return {
      provider: 'apple' as const,
      active: false,
      enabled: false,
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'future' as const,
      subscriptionUrl: null,
      maskedUrl: null,
      tokenCreatedAt: null,
      tokenRotatedAt: null,
      feedEtag: null,
      lastSyncAt: null,
    }
  }
  const url = rawToken ? appleWebcalUrl(rawToken) : null
  return {
    provider: 'apple' as const,
    active: Boolean(row.enabled) && Boolean(row.apple_token_hash),
    enabled: Boolean(row.enabled),
    syncWeddings: Boolean(row.sync_weddings),
    syncSessions: Boolean(row.sync_sessions),
    backfillMode: (row.backfill_mode as 'future' | 'all_active') ?? 'future',
    subscriptionUrl: url,
    maskedUrl: url ? maskUrl(url) : null,
    tokenCreatedAt: (row.apple_token_created_at as string) ?? null,
    tokenRotatedAt: (row.apple_token_rotated_at as string) ?? null,
    feedEtag: (row.apple_feed_etag as string) ?? null,
    lastSyncAt: (row.last_sync_at as string) ?? null,
  }
}

async function ensureAppleToken(
  service: SupabaseClient,
  userId: string,
  patch: Record<string, unknown> = {},
): Promise<{ row: IntegrationRow; rawToken: string }> {
  const rawToken = randomToken(32)
  const hash = await sha256Hex(rawToken)
  const now = new Date().toISOString()

  const { data: existing } = await service
    .from('calendar_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'apple')
    .maybeSingle()

  const payload = {
    user_id: userId,
    provider: 'apple',
    enabled: true,
    sync_weddings: existing?.sync_weddings ?? true,
    sync_sessions: existing?.sync_sessions ?? true,
    backfill_mode: existing?.backfill_mode ?? 'future',
    apple_token_hash: hash,
    apple_token_created_at: existing?.apple_token_created_at ?? now,
    apple_token_rotated_at: existing ? now : null,
    apple_feed_etag: `W/"${Date.now().toString(36)}"`,
    last_error_code: null,
    last_error_at: null,
    last_error_message: null,
    ...patch,
  }

  let row: IntegrationRow
  if (existing) {
    const { data, error } = await service
      .from('calendar_integrations')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error || !data) throw new Error('apple_activate_failed')
    row = data
  } else {
    const { data, error } = await service
      .from('calendar_integrations')
      .insert(payload)
      .select('*')
      .single()
    if (error || !data) throw new Error('apple_activate_failed')
    row = data
  }
  return { row, rawToken }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const action = String(body.action ?? '')
  const service = createServiceClient()

  // Internal worker call from OAuth callback (service-role only).
  if (action === 'process_jobs_internal') {
    const internal = req.headers.get('x-ourwed-internal')
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey || internal !== serviceKey) {
      return errorResponse('UNAUTHORIZED', 'Unauthorized', 401)
    }
    const targetUserId = String(body.userId ?? '')
    if (!targetUserId) {
      return errorResponse('INVALID', 'userId required')
    }
    try {
      const result = await processJobs(service, targetUserId)
      return jsonResponse({ ok: true, ...result })
    } catch (err) {
      logCalendar('error', 'internal_process_failed', {
        provider: 'google',
        operation: 'process_jobs_internal',
        message: err instanceof Error ? err.message : 'unknown',
      })
      return errorResponse('INTERNAL', 'process failed', 500)
    }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401)

  const userClient = createUserClient(authHeader)
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401)
  }
  const userId = userData.user.id

  try {
    if (action === 'list_calendars') {
      const { data: integration } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      if (!integration?.google_connected_at) {
        return errorResponse('NOT_CONNECTED', 'Google Calendar nie jest połączony.')
      }
      const tokenResult = await getAccessToken(service, integration)
      if ('error' in tokenResult) {
        return errorResponse(tokenResult.error, 'Wymagane ponowne połączenie.')
      }
      const res = await googleFetch(
        tokenResult.token,
        '/users/me/calendarList?minAccessRole=writer',
      )
      if (!res.ok) {
        return errorResponse('LIST_FAILED', 'Nie udało się pobrać kalendarzy.')
      }
      const json = (await res.json()) as {
        items?: Array<{
          id: string
          summary?: string
          primary?: boolean
          accessRole?: string
        }>
      }
      const calendars = (json.items ?? [])
        .filter((c) =>
          ['owner', 'writer'].includes(c.accessRole ?? ''),
        )
        .map((c) => ({
          id: c.id,
          summary: c.summary || c.id,
          primary: Boolean(c.primary),
          accessRole: c.accessRole || 'writer',
        }))
      return jsonResponse({ ok: true, calendars })
    }

    if (action === 'update_settings') {
      const { data: integration } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      if (!integration) {
        return errorResponse('NOT_CONNECTED', 'Google Calendar nie jest połączony.')
      }

      const prevWeddings = integration.sync_weddings
      const prevSessions = integration.sync_sessions
      const prevCalendar = integration.google_calendar_id

      const patch: Record<string, unknown> = {}
      if (typeof body.calendarId === 'string') {
        patch.google_calendar_id = body.calendarId
        patch.google_calendar_name =
          typeof body.calendarName === 'string'
            ? body.calendarName
            : integration.google_calendar_name
        patch.last_error_code = null
        patch.last_error_at = null
        patch.last_error_message = null
      }
      if (typeof body.syncWeddings === 'boolean') {
        patch.sync_weddings = body.syncWeddings
      }
      if (typeof body.syncSessions === 'boolean') {
        patch.sync_sessions = body.syncSessions
      }
      if (body.backfillMode === 'future' || body.backfillMode === 'all_active') {
        patch.backfill_mode = body.backfillMode
      }
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

      const { data: updated } = await service
        .from('calendar_integrations')
        .update(patch)
        .eq('id', integration.id)
        .select('*')
        .single()

      const categoryChanged =
        (typeof body.syncWeddings === 'boolean' &&
          body.syncWeddings !== prevWeddings) ||
        (typeof body.syncSessions === 'boolean' &&
          body.syncSessions !== prevSessions) ||
        (typeof body.calendarId === 'string' &&
          body.calendarId !== prevCalendar) ||
        ((body.backfillMode === 'future' || body.backfillMode === 'all_active') &&
          body.backfillMode !== integration.backfill_mode)

      if (categoryChanged && updated?.enabled) {
        await enqueueCoalescedJob(service, {
          userId,
          entityType: 'integration',
          entityId: updated.id as string,
          provider: 'google',
          operation: 'sync_now',
        })
        await processJobs(service, userId)
      }

      const { data: apple } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()

      return jsonResponse({
        ok: true,
        snapshot: {
          google: mapGoogleView(updated),
          apple: mapAppleView(apple),
        },
      })
    }

    if (action === 'sync_now') {
      const { data: integration } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      if (!integration?.enabled) {
        return errorResponse('NOT_CONNECTED', 'Google Calendar nie jest połączony.')
      }
      await enqueueCoalescedJob(service, {
        userId,
        entityType: 'integration',
        entityId: integration.id as string,
        provider: 'google',
        operation: 'sync_now',
      })
      const tokenResult = await getAccessToken(service, integration)
      if ('error' in tokenResult) {
        return errorResponse(
          tokenResult.error,
          'Połączenie z Google Calendar wygasło. Połącz konto ponownie.',
        )
      }
      const result = await syncNow(
        service,
        userId,
        integration,
        tokenResult.token,
      )
      // Mark coalesced job succeeded if still pending/running
      await service
        .from('calendar_sync_jobs')
        .update({ status: 'succeeded' })
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('operation', 'sync_now')
        .in('status', ['pending', 'running'])
      return jsonResponse({ ok: true, result })
    }

    if (action === 'process_jobs') {
      const result = await processJobs(service, userId)
      return jsonResponse({ ok: true, ...result })
    }

    if (action === 'reconcile_duplicates') {
      const { data: integration } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      if (!integration?.enabled) {
        return errorResponse('NOT_CONNECTED', 'Google Calendar nie jest połączony.')
      }
      const tokenResult = await getAccessToken(service, integration)
      if ('error' in tokenResult) {
        return errorResponse(
          tokenResult.error,
          'Połączenie z Google Calendar wygasło. Połącz konto ponownie.',
        )
      }

      const calendarId = String(integration.google_calendar_id || 'primary')
      const connectedAt =
        (integration.google_connected_at as string | null) ?? null
      const results = []

      // Prefer mapped entities (fingerprints available for title/date orphan cleanup).
      const { data: mappings } = await service
        .from('external_calendar_events')
        .select('entity_type, entity_id')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('external_calendar_id', normalizeCalendarId(calendarId))

      const mappedKeys = new Set(
        (mappings ?? []).map((m) => `${m.entity_type}:${m.entity_id}`),
      )

      for (const m of mappings ?? []) {
        if (m.entity_type !== 'wedding' && m.entity_type !== 'session') continue
        results.push(
          await reconcileEntityDuplicates(
            service,
            tokenResult.token,
            userId,
            calendarId,
            m.entity_type,
            m.entity_id as string,
            { connectedAt },
          ),
        )
      }

      const { data: weddings } = await service
        .from('weddings')
        .select('id')
        .eq('user_id', userId)
      for (const w of weddings ?? []) {
        if (mappedKeys.has(`wedding:${w.id}`)) continue
        results.push(
          await reconcileEntityDuplicates(
            service,
            tokenResult.token,
            userId,
            calendarId,
            'wedding',
            w.id,
            { connectedAt },
          ),
        )
      }

      const { data: sessions } = await service
        .from('sessions')
        .select('id')
        .eq('user_id', userId)
      for (const s of sessions ?? []) {
        if (mappedKeys.has(`session:${s.id}`)) continue
        results.push(
          await reconcileEntityDuplicates(
            service,
            tokenResult.token,
            userId,
            calendarId,
            'session',
            s.id,
            { connectedAt },
          ),
        )
      }

      const deleted = results.reduce((n, r) => n + r.deleted.length, 0)
      const found = results.reduce((n, r) => n + r.found, 0)
      const titleMatches = results.reduce((n, r) => n + r.titleDateMatches, 0)
      const manual = results.flatMap((r) => r.needsManualDeletion)
      logCalendar('info', 'reconcile_duplicates_done', {
        provider: 'google',
        operation: 'reconcile',
        found,
        deleted,
        titleMatches,
        manual: manual.length,
        entities: results.length,
      })

      return jsonResponse({
        ok: true,
        summary: {
          entities: results.length,
          ownedEventsFound: found,
          titleDateMatches: titleMatches,
          duplicatesDeleted: deleted,
          kept: results.filter((r) => r.kept).length,
          needsManualDeletion: manual,
        },
        results,
      })
    }

    if (action === 'enqueue_entity') {
      const entityType = body.entityType as 'wedding' | 'session'
      const entityId = String(body.entityId ?? '')
      const operation = (body.operation as 'upsert' | 'delete') || 'upsert'
      if (
        (entityType !== 'wedding' && entityType !== 'session') ||
        !entityId
      ) {
        return errorResponse('INVALID_ENTITY', 'Nieprawidłowa encja.')
      }

      // Ownership check
      if (entityType === 'wedding') {
        const { data } = await service
          .from('weddings')
          .select('id')
          .eq('id', entityId)
          .eq('user_id', userId)
          .maybeSingle()
        if (!data && operation !== 'delete') {
          return errorResponse('FORBIDDEN', 'Brak dostępu do zlecenia.', 403)
        }
      } else {
        const { data } = await service
          .from('sessions')
          .select('id')
          .eq('id', entityId)
          .eq('user_id', userId)
          .maybeSingle()
        if (!data && operation !== 'delete') {
          return errorResponse('FORBIDDEN', 'Brak dostępu do sesji.', 403)
        }
      }

      await service
        .from('calendar_sync_jobs')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'pending')

      await enqueueCoalescedJob(service, {
        userId,
        entityType,
        entityId,
        provider: 'google',
        operation,
      })
      await processJobs(service, userId)
      return jsonResponse({ ok: true })
    }

    if (action === 'disconnect') {
      const removeEvents = Boolean(body.removeEvents)
      const { data: integration } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()

      if (integration) {
        if (removeEvents) {
          const tokenResult = await getAccessToken(service, integration)
          if ('token' in tokenResult) {
            const { data: mappings } = await service
              .from('external_calendar_events')
              .select('*')
              .eq('user_id', userId)
              .eq('provider', 'google')
              .neq('sync_status', 'deleted')
            for (const m of mappings ?? []) {
              if (m.external_event_id) {
                await removeGoogleEventIfMapped(
                  service,
                  userId,
                  integration,
                  tokenResult.token,
                  m.entity_type,
                  m.entity_id,
                )
              }
            }
          }
        }

        // Best-effort token revoke
        try {
          const { data: secret } = await service
            .from('calendar_integration_secrets')
            .select('refresh_token_enc, access_token_enc')
            .eq('integration_id', integration.id)
            .maybeSingle()
          if (secret) {
            const key = resolveTokenKey()
            const token = secret.refresh_token_enc
              ? await decryptSecret(secret.refresh_token_enc, key)
              : secret.access_token_enc
                ? await decryptSecret(secret.access_token_enc, key)
                : null
            if (token) {
              await fetch(
                `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
                { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
              )
            }
          }
        } catch {
          // ignore revoke failures
        }

        await service
          .from('calendar_integration_secrets')
          .delete()
          .eq('integration_id', integration.id)

        await service
          .from('calendar_sync_jobs')
          .update({ status: 'cancelled' })
          .eq('user_id', userId)
          .eq('provider', 'google')
          .in('status', ['pending', 'failed', 'running'])

        await service
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
          .eq('id', integration.id)
      }

      const { data: google } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      const { data: apple } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()

      return jsonResponse({
        ok: true,
        snapshot: {
          google: mapGoogleView(google),
          apple: mapAppleView(apple),
        },
      })
    }

    if (action === 'apple_activate') {
      const patch: Record<string, unknown> = {}
      if (typeof body.syncWeddings === 'boolean') {
        patch.sync_weddings = body.syncWeddings
      }
      if (typeof body.syncSessions === 'boolean') {
        patch.sync_sessions = body.syncSessions
      }
      if (body.backfillMode === 'future' || body.backfillMode === 'all_active') {
        patch.backfill_mode = body.backfillMode
      }
      const { row, rawToken } = await ensureAppleToken(service, userId, patch)
      return jsonResponse({ ok: true, apple: mapAppleView(row, rawToken) })
    }

    if (action === 'apple_rotate') {
      const { row, rawToken } = await ensureAppleToken(service, userId)
      return jsonResponse({ ok: true, apple: mapAppleView(row, rawToken) })
    }

    if (action === 'apple_disable') {
      const { data: existing } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()
      if (existing) {
        await service
          .from('calendar_integrations')
          .update({
            enabled: false,
            apple_token_hash: null,
            apple_feed_etag: null,
          })
          .eq('id', existing.id)
      }
      const { data: apple } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()
      return jsonResponse({ ok: true, apple: mapAppleView(apple) })
    }

    if (action === 'apple_update_settings') {
      const { data: existing } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()
      if (!existing) {
        return errorResponse('NOT_ACTIVE', 'Kalendarz Apple nie jest aktywny.')
      }
      const patch: Record<string, unknown> = {
        apple_feed_etag: `W/"${Date.now().toString(36)}"`,
      }
      if (typeof body.syncWeddings === 'boolean') {
        patch.sync_weddings = body.syncWeddings
      }
      if (typeof body.syncSessions === 'boolean') {
        patch.sync_sessions = body.syncSessions
      }
      if (body.backfillMode === 'future' || body.backfillMode === 'all_active') {
        patch.backfill_mode = body.backfillMode
      }
      const { data: apple } = await service
        .from('calendar_integrations')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single()
      return jsonResponse({ ok: true, apple: mapAppleView(apple) })
    }

    if (action === 'apple_refresh_meta') {
      const { data: existing } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()
      if (!existing?.enabled) {
        return errorResponse('NOT_ACTIVE', 'Kalendarz Apple nie jest aktywny.')
      }
      const { data: apple } = await service
        .from('calendar_integrations')
        .update({
          apple_feed_etag: `W/"${Date.now().toString(36)}"`,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      return jsonResponse({ ok: true, apple: mapAppleView(apple) })
    }

    if (action === 'entity_status') {
      const entityType = body.entityType as 'wedding' | 'session'
      const entityId = String(body.entityId ?? '')

      const { data: google } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle()
      const { data: apple } = await service
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .maybeSingle()
      const { data: mapping } = await service
        .from('external_calendar_events')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .maybeSingle()

      const categoryDisabled =
        entityType === 'wedding'
          ? google && !google.sync_weddings
          : google && !google.sync_sessions

      let googleState:
        | 'not_configured'
        | 'pending'
        | 'syncing'
        | 'synced'
        | 'needs_attention'
        | 'category_disabled'
        | 'omitted' = 'not_configured'

      if (!google?.enabled || !google.google_connected_at) {
        googleState = 'not_configured'
      } else if (categoryDisabled) {
        googleState = 'category_disabled'
      } else if (mapping?.sync_status === 'error') {
        googleState = 'needs_attention'
      } else if (mapping?.sync_status === 'syncing') {
        googleState = 'syncing'
      } else if (mapping?.sync_status === 'pending') {
        googleState = 'pending'
      } else if (mapping?.sync_status === 'synced') {
        googleState = 'synced'
      } else if (mapping?.sync_status === 'omitted') {
        googleState = 'omitted'
      } else {
        googleState = 'pending'
      }

      const appleCategoryDisabled =
        entityType === 'wedding'
          ? apple && !apple.sync_weddings
          : apple && !apple.sync_sessions

      let appleState: 'inactive' | 'available' | 'category_disabled' | 'omitted' =
        'inactive'
      if (!apple?.enabled || !apple.apple_token_hash) appleState = 'inactive'
      else if (appleCategoryDisabled) appleState = 'category_disabled'
      else appleState = 'available'

      return jsonResponse({
        ok: true,
        status: {
          google: {
            state: googleState,
            externalEventUrl: mapping?.external_event_url ?? null,
            lastSyncedAt: mapping?.last_synced_at ?? null,
            lastErrorCode: mapping?.last_error_code ?? null,
          },
          apple: { state: appleState },
        },
      })
    }

    return errorResponse('INVALID_ACTION', `Unknown action: ${action}`)
  } catch (err) {
    logCalendar('error', 'sync_handler_failed', {
      provider: 'google',
      operation: action,
      errorCategory: 'handler',
      message: err instanceof Error ? err.message : 'unknown',
    })
    return errorResponse(
      'INTERNAL',
      'Nie udało się wykonać operacji kalendarza.',
      500,
    )
  }
})

// silence unused in some builds
void appPublicUrl

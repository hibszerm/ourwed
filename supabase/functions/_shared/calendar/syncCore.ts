/**
 * Google Calendar sync core: reservation, adoption, 404 heal helpers.
 * Used by google-calendar-sync Edge Function.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { logCalendar, type CanonicalEvent } from './cryptoDates.ts'

export function normalizeCalendarId(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  if (!v || v === 'primary') return 'primary'
  return v
}

export function jobCoalesceKey(input: {
  userId: string
  provider: string
  entityType: string
  entityId: string | null
  operation: string
}): string {
  return [
    input.userId,
    input.provider,
    input.entityType,
    input.entityId ?? 'none',
    input.operation,
  ].join(':')
}

export async function enqueueCoalescedJob(
  service: SupabaseClient,
  input: {
    userId: string
    entityType: string
    entityId: string | null
    provider: string
    operation: string
    payload?: Record<string, unknown>
  },
): Promise<{ inserted: boolean; jobId: string | null }> {
  const coalesce_key = jobCoalesceKey({
    userId: input.userId,
    provider: input.provider,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
  })

  // Cancel older pending siblings with same coalesce key (belt + suspenders)
  await service
    .from('calendar_sync_jobs')
    .update({ status: 'cancelled' })
    .eq('coalesce_key', coalesce_key)
    .eq('status', 'pending')

  const { data, error } = await service
    .from('calendar_sync_jobs')
    .insert({
      user_id: input.userId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      provider: input.provider,
      operation: input.operation,
      status: 'pending',
      coalesce_key,
      payload_json: input.payload ?? {},
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Unique violation → another pending/running job already owns the key
    if (error.code === '23505') {
      return { inserted: false, jobId: null }
    }
    throw error
  }
  return { inserted: true, jobId: data?.id ?? null }
}

export async function claimJob(
  service: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  const { data } = await service
    .from('calendar_sync_jobs')
    .update({
      status: 'running',
      locked_at: new Date().toISOString(),
      attempt_count: undefined as unknown as number,
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id, attempt_count')
    .maybeSingle()

  if (!data) return false

  await service
    .from('calendar_sync_jobs')
    .update({ attempt_count: (data.attempt_count ?? 0) + 1 })
    .eq('id', jobId)

  return true
}

type GoogleEventListItem = {
  id: string
  summary?: string
  htmlLink?: string
  created?: string
  start?: { date?: string }
  end?: { date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

/** fingerprint = entityType|entityId|YYYY-MM-DD|title */
export function parseSourceFingerprint(
  fingerprint: string | null | undefined,
): { startDate: string; title: string } | null {
  if (!fingerprint) return null
  const parts = fingerprint.split('|')
  if (parts.length < 4) return null
  const startDate = parts[2]
  const title = parts.slice(3).join('|')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !title) return null
  return { startDate, title }
}

function addOneCalendarDayUtc(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

export async function googleFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

export function ourwedPrivateProps(
  event: CanonicalEvent,
  userId: string,
): Record<string, string> {
  return {
    ourwed_source: 'ourwed',
    ourwed_entity_type: event.entityType,
    ourwed_entity_id: event.entityId,
    ourwed_user_ref: userId.slice(0, 8),
    ourwed_revision: event.fingerprint.slice(0, 64),
  }
}

/** Find OurWed-owned events for an entity via private extended properties. */
export async function findOwnedGoogleEvents(
  accessToken: string,
  calendarIdRaw: string,
  entityType: string,
  entityId: string,
): Promise<GoogleEventListItem[]> {
  const calendarId = encodeURIComponent(normalizeCalendarId(calendarIdRaw) === 'primary'
    ? 'primary'
    : calendarIdRaw)
  // Google privateExtendedProperty filter
  const params = new URLSearchParams({
    privateExtendedProperty: `ourwed_entity_id=${entityId}`,
    maxResults: '50',
    showDeleted: 'false',
  })
  const res = await googleFetch(
    accessToken,
    `/calendars/${calendarId}/events?${params}`,
  )
  if (!res.ok) {
    logCalendar('warn', 'owned_event_search_failed', {
      provider: 'google',
      operation: 'search',
      entityType,
      entityId,
      status: res.status,
    })
    return []
  }
  const json = (await res.json()) as { items?: GoogleEventListItem[] }
  return (json.items ?? []).filter((item) => {
    const priv = item.extendedProperties?.private ?? {}
    return (
      priv.ourwed_source === 'ourwed' &&
      priv.ourwed_entity_type === entityType &&
      priv.ourwed_entity_id === entityId
    )
  })
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarIdRaw: string,
  eventId: string,
): Promise<boolean> {
  const calendarId = encodeURIComponent(
    normalizeCalendarId(calendarIdRaw) === 'primary' ? 'primary' : calendarIdRaw,
  )
  const res = await googleFetch(
    accessToken,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  )
  return res.ok || res.status === 404 || res.status === 410
}

/**
 * Reserve exclusive create right via unique mapping row.
 * Returns 'reserved' | 'exists' | 'conflict'
 */
export async function reserveMapping(
  service: SupabaseClient,
  input: {
    userId: string
    entityType: string
    entityId: string
    calendarId: string
    fingerprint: string
  },
): Promise<
  | { status: 'reserved'; mappingId: string }
  | { status: 'exists'; mapping: Record<string, unknown> }
  | { status: 'conflict' }
> {
  const calendarId = normalizeCalendarId(input.calendarId)

  const { data: existing } = await service
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', input.userId)
    .eq('provider', 'google')
    .eq('entity_type', input.entityType)
    .eq('entity_id', input.entityId)
    .eq('external_calendar_id', calendarId)
    .maybeSingle()

  if (existing?.external_event_id && existing.sync_status === 'synced') {
    return { status: 'exists', mapping: existing }
  }

  if (existing?.sync_status === 'reserving' || existing?.sync_status === 'syncing') {
    // Another worker holds the lease
    const lockedAt = existing.updated_at
      ? new Date(existing.updated_at as string).getTime()
      : 0
    if (Date.now() - lockedAt < 60_000) {
      return { status: 'conflict' }
    }
  }

  if (existing) {
    const { data: claimed } = await service
      .from('external_calendar_events')
      .update({
        sync_status: 'reserving',
        source_fingerprint: input.fingerprint,
        last_error_code: null,
      })
      .eq('id', existing.id)
      .in('sync_status', ['pending', 'error', 'omitted', 'deleted', 'synced', 'reserving', 'syncing'])
      .select('id, sync_status, external_event_id, updated_at')
      .maybeSingle()

    if (!claimed) return { status: 'conflict' }
    if (claimed.external_event_id && claimed.sync_status === 'synced') {
      return { status: 'exists', mapping: claimed }
    }
    // Re-claim only if we won the race (status is now reserving)
    const { data: won } = await service
      .from('external_calendar_events')
      .update({ sync_status: 'reserving' })
      .eq('id', existing.id)
      .select('id')
      .maybeSingle()
    if (!won) return { status: 'conflict' }
    return { status: 'reserved', mappingId: existing.id as string }
  }

  const { data: inserted, error } = await service
    .from('external_calendar_events')
    .insert({
      user_id: input.userId,
      provider: 'google',
      entity_type: input.entityType,
      entity_id: input.entityId,
      external_calendar_id: calendarId,
      source_fingerprint: input.fingerprint,
      sync_status: 'reserving',
    })
    .select('id')
    .maybeSingle()

  if (error?.code === '23505') {
    const { data: raced } = await service
      .from('external_calendar_events')
      .select('*')
      .eq('user_id', input.userId)
      .eq('provider', 'google')
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .eq('external_calendar_id', calendarId)
      .maybeSingle()
    if (raced?.external_event_id) {
      return { status: 'exists', mapping: raced }
    }
    return { status: 'conflict' }
  }
  if (error || !inserted) return { status: 'conflict' }
  return { status: 'reserved', mappingId: inserted.id }
}

export type ReconcileEntityResult = {
  entityType: string
  entityId: string
  found: number
  kept: string | null
  deleted: string[]
  mappingRepaired: boolean
  needsManualDeletion: string[]
  titleDateMatches: number
}

/**
 * List all-day events on a calendar date with an exact title match.
 * Used only for narrowly scoped orphan cleanup when private props are missing.
 */
export async function listExactTitleDateEvents(
  accessToken: string,
  calendarIdRaw: string,
  title: string,
  startDate: string,
): Promise<GoogleEventListItem[]> {
  const calendarId = encodeURIComponent(
    normalizeCalendarId(calendarIdRaw) === 'primary' ? 'primary' : calendarIdRaw,
  )
  const endExclusive = addOneCalendarDayUtc(startDate)
  const params = new URLSearchParams({
    timeMin: `${startDate}T00:00:00.000Z`,
    timeMax: `${endExclusive}T00:00:00.000Z`,
    singleEvents: 'true',
    maxResults: '50',
    showDeleted: 'false',
  })
  const res = await googleFetch(
    accessToken,
    `/calendars/${calendarId}/events?${params}`,
  )
  if (!res.ok) return []
  const json = (await res.json()) as { items?: GoogleEventListItem[] }
  return (json.items ?? []).filter(
    (item) => item.summary === title && item.start?.date === startDate,
  )
}

function inConnectWindow(
  created: string | undefined,
  connectedAt: string | null | undefined,
  windowMs = 15 * 60 * 1000,
): boolean {
  if (!created || !connectedAt) return false
  const c = new Date(created).getTime()
  const start = new Date(connectedAt).getTime()
  if (Number.isNaN(c) || Number.isNaN(start)) return false
  return c >= start - 60_000 && c <= start + windowMs
}

export async function reconcileEntityDuplicates(
  service: SupabaseClient,
  accessToken: string,
  userId: string,
  calendarIdRaw: string,
  entityType: 'wedding' | 'session',
  entityId: string,
  options?: { connectedAt?: string | null },
): Promise<ReconcileEntityResult> {
  const calendarId = normalizeCalendarId(calendarIdRaw)
  const calendarPath =
    calendarId === 'primary' ? 'primary' : calendarIdRaw
  const owned = await findOwnedGoogleEvents(
    accessToken,
    calendarPath,
    entityType,
    entityId,
  )

  const { data: mapping } = await service
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('external_calendar_id', calendarId)
    .maybeSingle()

  const mappedId = (mapping?.external_event_id as string | null) ?? null
  const parsed = parseSourceFingerprint(
    (mapping?.source_fingerprint as string | null) ?? null,
  )

  let titleDateMatches: GoogleEventListItem[] = []
  if (parsed) {
    titleDateMatches = await listExactTitleDateEvents(
      accessToken,
      calendarPath,
      parsed.title,
      parsed.startDate,
    )
  }

  // Merge candidates by id (owned props + exact title/date matches)
  const byId = new Map<string, GoogleEventListItem>()
  for (const ev of [...owned, ...titleDateMatches]) {
    byId.set(ev.id, ev)
  }
  const candidates = [...byId.values()]

  let keep: GoogleEventListItem | null = null
  if (mappedId) {
    keep =
      candidates.find((e) => e.id === mappedId) ??
      ({ id: mappedId } as GoogleEventListItem)
  }
  if (!keep && owned.length > 0) {
    keep = [...owned].sort((a, b) =>
      String(a.created ?? '').localeCompare(String(b.created ?? '')),
    )[0]
  }
  if (!keep && titleDateMatches.length > 0) {
    const inWindow = titleDateMatches.filter((e) =>
      inConnectWindow(e.created, options?.connectedAt),
    )
    const pool = inWindow.length > 0 ? inWindow : titleDateMatches
    keep = [...pool].sort((a, b) =>
      String(a.created ?? '').localeCompare(String(b.created ?? '')),
    )[0]
  }

  const deleted: string[] = []
  const needsManualDeletion: string[] = []

  for (const ev of candidates) {
    if (!keep || ev.id === keep.id) continue

    const priv = ev.extendedProperties?.private ?? {}
    const isOurwedOwned =
      priv.ourwed_source === 'ourwed' &&
      priv.ourwed_entity_type === entityType &&
      priv.ourwed_entity_id === entityId

    // Never delete events owned by a different OurWed entity
    if (
      priv.ourwed_source === 'ourwed' &&
      priv.ourwed_entity_id &&
      priv.ourwed_entity_id !== entityId
    ) {
      continue
    }

    const isRaceOrphan =
      !isOurwedOwned &&
      Boolean(parsed) &&
      ev.summary === parsed!.title &&
      ev.start?.date === parsed!.startDate &&
      inConnectWindow(ev.created, options?.connectedAt)

    if (!isOurwedOwned && !isRaceOrphan) {
      // Same title/date but outside connect window and without OurWed props —
      // likely a user-created event; leave it alone.
      if (ev.summary === parsed?.title && ev.start?.date === parsed?.startDate) {
        needsManualDeletion.push(ev.id)
      }
      continue
    }

    const ok = await deleteGoogleEvent(accessToken, calendarPath, ev.id)
    if (ok) deleted.push(ev.id)
  }

  let mappingRepaired = false
  if (keep) {
    await service.from('external_calendar_events').upsert(
      {
        user_id: userId,
        provider: 'google',
        entity_type: entityType,
        entity_id: entityId,
        external_calendar_id: calendarId,
        external_event_id: keep.id,
        external_event_url: keep.htmlLink ?? null,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        last_error_code: null,
        last_error_at: null,
        source_fingerprint: mapping?.source_fingerprint ?? '',
      },
      {
        onConflict:
          'user_id,provider,entity_type,entity_id,external_calendar_id',
      },
    )
    mappingRepaired = true
  }

  return {
    entityType,
    entityId,
    found: owned.length,
    kept: keep?.id ?? null,
    deleted,
    mappingRepaired,
    needsManualDeletion,
    titleDateMatches: titleDateMatches.length,
  }
}

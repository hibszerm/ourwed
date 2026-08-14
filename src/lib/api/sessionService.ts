import { resolveStudioUserId } from '@/lib/api/studioUser'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import { supabase } from '@/lib/supabase'
import { isLikelyUuid, throwOnError } from '@/lib/supabase/helpers'
import type {
  CreateSessionInput,
  Session,
  SessionLocation,
  SessionPerson,
  SessionType,
  UpdateSessionInput,
} from '@/types/session'
import type { SessionPayment } from '@/types/sessionPayment'

export interface SessionRow {
  id: string
  user_id: string
  custom_name: string | null
  primary_first_name: string | null
  primary_last_name: string | null
  secondary_first_name: string | null
  secondary_last_name: string | null
  session_type: string
  custom_session_type: string | null
  session_date: string
  start_time: string | null
  end_time: string | null
  location_name: string | null
  location_address: string | null
  formatted_address: string | null
  place_id: string | null
  latitude: number | null
  longitude: number | null
  location_source: string | null
  total_price: number | string
  deposit_amount: number | string
  notes: string | null
  linked_wedding_id: string | null
  created_at: string
  updated_at: string
}

const SESSION_TYPES: SessionType[] = [
  'engagement',
  'postWedding',
  'family',
  'business',
  'other',
]

function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as string[]).includes(value)
}

function trimOrUndef(value: string | null | undefined): string | undefined {
  const t = value?.trim()
  return t ? t : undefined
}

function personFrom(
  first?: string | null,
  last?: string | null,
): SessionPerson {
  return {
    firstName: trimOrUndef(first ?? undefined),
    lastName: trimOrUndef(last ?? undefined),
  }
}

function hasPersonContent(person?: SessionPerson): boolean {
  return Boolean(person?.firstName?.trim() || person?.lastName?.trim())
}

function locationFromRow(row: SessionRow): SessionLocation | undefined {
  const name = trimOrUndef(row.location_name)
  const address = trimOrUndef(row.location_address)
  const formattedAddress = trimOrUndef(row.formatted_address)
  const placeId = trimOrUndef(row.place_id)
  const source = trimOrUndef(row.location_source)
  if (
    !name &&
    !address &&
    !formattedAddress &&
    !placeId &&
    row.latitude == null &&
    row.longitude == null
  ) {
    return undefined
  }
  return {
    name,
    address,
    formattedAddress,
    placeId,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    source,
  }
}

function timeFromDb(value: string | null): string | undefined {
  if (!value) return undefined
  // Postgres time may be "HH:MM:SS"
  return value.slice(0, 5)
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function mapSessionRowToModel(row: SessionRow): Session {
  const primary = personFrom(row.primary_first_name, row.primary_last_name)
  const secondary = personFrom(
    row.secondary_first_name,
    row.secondary_last_name,
  )
  const sessionType = isSessionType(row.session_type)
    ? row.session_type
    : 'other'

  return {
    id: row.id,
    customName: trimOrUndef(row.custom_name),
    primaryPerson: primary,
    secondaryPerson: hasPersonContent(secondary) ? secondary : undefined,
    sessionType,
    customSessionType:
      sessionType === 'other'
        ? trimOrUndef(row.custom_session_type)
        : undefined,
    date: row.session_date.slice(0, 10),
    startTime: timeFromDb(row.start_time),
    endTime: timeFromDb(row.end_time),
    location: locationFromRow(row),
    totalPrice: toNumber(row.total_price),
    depositAmount: toNumber(row.deposit_amount),
    payments: [],
    notes: trimOrUndef(row.notes),
    linkedWeddingId: row.linked_wedding_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function withPayments(sessions: Session[]): Promise<Session[]> {
  if (sessions.length === 0) return sessions
  const map = await sessionPaymentService.listBySessionIds(
    sessions.map((s) => s.id),
  )
  return sessions.map((s) => ({
    ...s,
    payments: map.get(s.id) ?? ([] as SessionPayment[]),
  }))
}

function locationColumns(location?: SessionLocation | null) {
  if (!location) {
    return {
      location_name: null,
      location_address: null,
      formatted_address: null,
      place_id: null,
      latitude: null,
      longitude: null,
      location_source: null,
    }
  }
  return {
    location_name: trimOrUndef(location.name) ?? null,
    location_address: trimOrUndef(location.address) ?? null,
    formatted_address: trimOrUndef(location.formattedAddress) ?? null,
    place_id: trimOrUndef(location.placeId) ?? null,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
    location_source: trimOrUndef(location.source) ?? null,
  }
}

function normalizeTypeFields(
  sessionType: SessionType,
  customSessionType?: string | null,
) {
  if (sessionType === 'other') {
    return {
      session_type: sessionType,
      custom_session_type: trimOrUndef(customSessionType ?? undefined) ?? null,
    }
  }
  return {
    session_type: sessionType,
    custom_session_type: null,
  }
}

function inputToInsertRow(
  userId: string,
  input: CreateSessionInput,
): Record<string, unknown> {
  const primary = input.primaryPerson ?? {}
  const secondary = input.secondaryPerson ?? {}
  const typeFields = normalizeTypeFields(
    input.sessionType,
    input.customSessionType,
  )
  return {
    user_id: userId,
    custom_name: trimOrUndef(input.customName) ?? null,
    primary_first_name: trimOrUndef(primary.firstName) ?? null,
    primary_last_name: trimOrUndef(primary.lastName) ?? null,
    secondary_first_name: trimOrUndef(secondary.firstName) ?? null,
    secondary_last_name: trimOrUndef(secondary.lastName) ?? null,
    ...typeFields,
    session_date: input.date.slice(0, 10),
    start_time: trimOrUndef(input.startTime) ?? null,
    end_time: trimOrUndef(input.endTime) ?? null,
    ...locationColumns(input.location),
    total_price: Math.max(0, input.totalPrice || 0),
    deposit_amount: Math.max(0, input.depositAmount || 0),
    notes: trimOrUndef(input.notes) ?? null,
    linked_wedding_id: input.linkedWeddingId || null,
  }
}

export const sessionService = {
  async getAll(): Promise<Session[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: true, nullsFirst: false })

    throwOnError(error)
    return withPayments(
      ((data ?? []) as SessionRow[]).map(mapSessionRowToModel),
    )
  },

  async getById(id: string): Promise<Session | null> {
    if (!isLikelyUuid(id)) return null
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    throwOnError(error)
    if (!data) return null
    const [hydrated] = await withPayments([
      mapSessionRowToModel(data as SessionRow),
    ])
    return hydrated
  },

  async listByWeddingId(weddingId: string): Promise<Session[]> {
    if (!isLikelyUuid(weddingId)) return []
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('linked_wedding_id', weddingId)
      .order('session_date', { ascending: true })

    throwOnError(error)
    return withPayments(
      ((data ?? []) as SessionRow[]).map(mapSessionRowToModel),
    )
  },

  async create(input: CreateSessionInput): Promise<Session> {
    const userId = await resolveStudioUserId()
    const row = inputToInsertRow(userId, input)
    const { data, error } = await supabase
      .from('sessions')
      .insert(row)
      .select('*')
      .single()

    throwOnError(error)
    if (!data) throw new Error('Nie udało się utworzyć sesji.')
    const created = {
      ...mapSessionRowToModel(data as SessionRow),
      payments: [] as SessionPayment[],
    }

    const { enqueueExternalCalendarSync } = await import(
      '@/features/calendar-integrations/calendarIntegrationsService'
    )
    void enqueueExternalCalendarSync({
      entityType: 'session',
      entityId: created.id,
      operation: 'upsert',
    })

    return created
  },

  async update(id: string, input: UpdateSessionInput): Promise<Session> {
    if (!isLikelyUuid(id)) throw new Error('Nieprawidłowy identyfikator sesji.')
    const userId = await resolveStudioUserId()
    const existing = await this.getById(id)
    if (!existing) throw new Error('Sesja nie istnieje.')

    const merged: CreateSessionInput = {
      customName:
        input.customName !== undefined ? input.customName : existing.customName,
      primaryPerson: input.primaryPerson ?? existing.primaryPerson,
      secondaryPerson:
        input.secondaryPerson !== undefined
          ? input.secondaryPerson
          : existing.secondaryPerson,
      sessionType: input.sessionType ?? existing.sessionType,
      customSessionType:
        input.customSessionType !== undefined
          ? input.customSessionType
          : existing.customSessionType,
      date: input.date ?? existing.date,
      startTime:
        input.startTime !== undefined ? input.startTime : existing.startTime,
      endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
      location:
        input.location !== undefined ? input.location : existing.location,
      totalPrice:
        input.totalPrice !== undefined
          ? input.totalPrice
          : existing.totalPrice,
      depositAmount:
        input.depositAmount !== undefined
          ? input.depositAmount
          : existing.depositAmount,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      linkedWeddingId:
        input.linkedWeddingId !== undefined
          ? input.linkedWeddingId
          : existing.linkedWeddingId ?? null,
    }

    const { user_id: _uid, ...patch } = inputToInsertRow(userId, merged)
    void _uid

    const { data, error } = await supabase
      .from('sessions')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single()

    throwOnError(error)
    if (!data) throw new Error('Nie udało się zaktualizować sesji.')
    const updated = {
      ...mapSessionRowToModel(data as SessionRow),
      payments: existing.payments,
    }

    const { enqueueExternalCalendarSync } = await import(
      '@/features/calendar-integrations/calendarIntegrationsService'
    )
    void enqueueExternalCalendarSync({
      entityType: 'session',
      entityId: updated.id,
      operation: 'upsert',
    })

    return updated
  },

  async delete(id: string): Promise<void> {
    if (!isLikelyUuid(id)) return
    const userId = await resolveStudioUserId()
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    throwOnError(error)

    const { enqueueExternalCalendarSync } = await import(
      '@/features/calendar-integrations/calendarIntegrationsService'
    )
    void enqueueExternalCalendarSync({
      entityType: 'session',
      entityId: id,
      operation: 'delete',
    })
  },
}

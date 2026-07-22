import { listOwnedWeddingIds } from '@/lib/api/ownership'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Wedding } from '@/types/wedding'
import { coupleName } from '@/lib/utils/dates'

export type CalendarEventType =
  | 'wedding'
  | 'meeting'
  | 'delivery'
  | 'shoot'
  | 'other'

export interface CalendarEvent {
  id: string
  weddingId: string
  title: string
  startDate: string
  endDate?: string
  type: CalendarEventType
  location?: string
  notes?: string
  color?: string
  allDay: boolean
  createdAt: string
}

interface CalendarEventRow {
  id: string
  wedding_id: string
  title: string
  start_date: string
  end_date: string | null
  type: string
  location: string | null
  notes: string | null
  color: string | null
  all_day: boolean
  created_at: string
}

function isCalendarEventType(value: string): value is CalendarEventType {
  return (
    value === 'wedding' ||
    value === 'meeting' ||
    value === 'delivery' ||
    value === 'shoot' ||
    value === 'other'
  )
}

/** Map `public.calendar_events` → app `CalendarEvent`. */
export function mapCalendarEventRowToModel(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    type: isCalendarEventType(row.type) ? row.type : 'other',
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    color: row.color ?? undefined,
    allDay: row.all_day,
    createdAt: row.created_at,
  }
}

export interface CreateCalendarEventInput {
  weddingId: string
  title: string
  startDate: string
  endDate?: string
  type?: CalendarEventType
  location?: string
  notes?: string
  color?: string
  allDay?: boolean
}

export interface UpdateCalendarEventInput {
  title?: string
  startDate?: string
  endDate?: string | null
  type?: CalendarEventType
  location?: string | null
  notes?: string | null
  color?: string | null
  allDay?: boolean
}

function weddingDayStartIso(date: string): string {
  return `${date.slice(0, 10)}T10:00:00.000Z`
}

/**
 * Calendar data layer — `public.calendar_events` only.
 */
export const calendarEventService = {
  async listAll(): Promise<CalendarEvent[]> {
    const weddingIds = await listOwnedWeddingIds()
    if (weddingIds.length === 0) return []

    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('start_date', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as CalendarEventRow[]).map(mapCalendarEventRowToModel)
  },

  async listByWeddingId(weddingId: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('start_date', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as CalendarEventRow[]).map(mapCalendarEventRowToModel)
  },

  async create(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        wedding_id: input.weddingId,
        title: input.title.trim(),
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        type: input.type ?? 'other',
        location: input.location?.trim() || null,
        notes: input.notes?.trim() || null,
        color: input.color ?? null,
        all_day: input.allDay ?? false,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć wydarzenia kalendarza.')
    }

    return mapCalendarEventRowToModel(data as CalendarEventRow)
  },

  async update(id: string, input: UpdateCalendarEventInput): Promise<CalendarEvent> {
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.startDate !== undefined) patch.start_date = input.startDate
    if (input.endDate !== undefined) patch.end_date = input.endDate
    if (input.type !== undefined) patch.type = input.type
    if (input.location !== undefined) patch.location = input.location
    if (input.notes !== undefined) patch.notes = input.notes
    if (input.color !== undefined) patch.color = input.color
    if (input.allDay !== undefined) patch.all_day = input.allDay

    const { data, error } = await supabase
      .from('calendar_events')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować wydarzenia kalendarza.')
    }

    return mapCalendarEventRowToModel(data as CalendarEventRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    throwOnError(error)
  },

  /**
   * Ensure a default all-day (or daytime) wedding event exists for the wedding date.
   * Creates one when missing; updates start date when the wedding day event exists.
   */
  async ensureWeddingDayEvent(wedding: Wedding): Promise<CalendarEvent | null> {
    if (!wedding.date) return null

    const existing = await this.listByWeddingId(wedding.id)
    const weddingEvent = existing.find((e) => e.type === 'wedding')
    const title = `Ślub: ${coupleName(wedding.couple.partner1, wedding.couple.partner2)}`
    const startDate = weddingDayStartIso(wedding.date)
    const location =
      wedding.ceremonyLocation || wedding.receptionLocation || wedding.couple.venue || undefined

    if (weddingEvent) {
      return this.update(weddingEvent.id, {
        title,
        startDate,
        location: location ?? null,
        color: wedding.accentColor,
        allDay: true,
      })
    }

    return this.create({
      weddingId: wedding.id,
      title,
      startDate,
      type: 'wedding',
      location,
      color: wedding.accentColor,
      allDay: true,
    })
  },

  /**
   * For each wedding with a date, ensure a wedding-day calendar row exists.
   * Used by the calendar page so the DB is the source of truth without deriving events.
   */
  async syncWeddingDayEvents(weddings: Wedding[]): Promise<CalendarEvent[]> {
    for (const wedding of weddings) {
      if (wedding.date) {
        await this.ensureWeddingDayEvent(wedding)
      }
    }
    return this.listAll()
  },
}

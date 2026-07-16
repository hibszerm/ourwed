import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type {
  WeddingTimelineEntry,
  WeddingTimelineEntryType,
} from '@/types/wedding'

interface TimelineEventRow {
  id: string
  wedding_id: string
  type: string
  title: string
  description: string | null
  created_by: string | null
  system_generated: boolean
  created_at: string
}

const TIMELINE_TYPES = new Set<WeddingTimelineEntryType>([
  'created',
  'questionnaire_sent',
  'questionnaire_completed',
  'contract_generated',
  'contract_signed',
  'payment_received',
  'note_added',
  'wedding_day',
  'deliverable',
  'package_changed',
])

function mapTimelineType(value: string): WeddingTimelineEntryType {
  return TIMELINE_TYPES.has(value as WeddingTimelineEntryType)
    ? (value as WeddingTimelineEntryType)
    : 'created'
}

export function mapTimelineEventRowToModel(
  row: TimelineEventRow,
): WeddingTimelineEntry {
  return {
    id: row.id,
    title: row.title,
    date: toDateString(row.created_at) || row.created_at,
    description: row.description ?? undefined,
    type: mapTimelineType(row.type),
  }
}

export interface CreateTimelineEventInput {
  weddingId: string
  type: WeddingTimelineEntryType | string
  title: string
  description?: string
  systemGenerated?: boolean
  date?: string
}

export const timelineEventService = {
  async listByWeddingId(weddingId: string): Promise<WeddingTimelineEntry[]> {
    const map = await this.listByWeddingIds([weddingId])
    return map.get(weddingId) ?? []
  },

  async listByWeddingIds(
    weddingIds: string[],
  ): Promise<Map<string, WeddingTimelineEntry[]>> {
    const map = new Map<string, WeddingTimelineEntry[]>()
    for (const id of weddingIds) map.set(id, [])
    if (weddingIds.length === 0) return map

    const { data, error } = await supabase
      .from('timeline_events')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('created_at', { ascending: false })

    throwOnError(error)

    for (const row of (data ?? []) as TimelineEventRow[]) {
      const list = map.get(row.wedding_id) ?? []
      list.push(mapTimelineEventRowToModel(row))
      map.set(row.wedding_id, list)
    }
    return map
  },

  async create(input: CreateTimelineEventInput): Promise<WeddingTimelineEntry> {
    let createdBy: string | null = null
    try {
      createdBy = await resolveStudioUserId()
    } catch {
      createdBy = null
    }

    const insert: Record<string, unknown> = {
      wedding_id: input.weddingId,
      type: input.type,
      title: input.title,
      description: input.description?.trim() || null,
      created_by: createdBy,
      system_generated: input.systemGenerated ?? false,
    }

    if (input.date) {
      insert.created_at = `${input.date.slice(0, 10)}T12:00:00.000Z`
    }

    const { data, error } = await supabase
      .from('timeline_events')
      .insert(insert)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zapisać wydarzenia timeline.')
    }

    return mapTimelineEventRowToModel(data as TimelineEventRow)
  },
}

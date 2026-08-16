/**
 * Lightweight wedding labels for Tasks Center — id + display name + date only.
 * Never calls weddingService.getAll / finalizeWeddingViews.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { Couple } from '@/types/wedding'

/** Architectural tests pin this select string. */
export const TASKS_WEDDING_META_SELECT =
  'id, bride_name, groom_name, display_name, wedding_date'

export interface TaskWeddingMeta {
  id: string
  label: string
  weddingDate: string | null
}

interface TaskWeddingMetaRow {
  id: string
  bride_name: string | null
  groom_name: string | null
  display_name: string | null
  wedding_date: string | null
}

function emptyCouple(partner1: string, partner2: string): Couple {
  return {
    partner1,
    partner2,
    email: '',
    phone: '',
    venue: '',
    city: '',
  }
}

export function mapTaskWeddingMetaRow(row: TaskWeddingMetaRow): TaskWeddingMeta {
  const label = getWeddingDisplayName(
    {
      displayName: row.display_name?.trim() || undefined,
      couple: emptyCouple(
        (row.bride_name ?? '').trim(),
        (row.groom_name ?? '').trim(),
      ),
    },
    { short: true },
  )

  return {
    id: row.id,
    label,
    weddingDate: toDateString(row.wedding_date) || null,
  }
}

/**
 * Batch-fetch wedding display metadata for the given ids (one query).
 * Empty input → empty map (no round-trip).
 */
export async function listTaskWeddingMetaByIds(
  weddingIds: string[],
): Promise<Map<string, TaskWeddingMeta>> {
  const unique = [...new Set(weddingIds.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const userId = await resolveStudioUserId()
  const { data, error } = await supabase
    .from('weddings')
    .select(TASKS_WEDDING_META_SELECT)
    .eq('user_id', userId)
    .in('id', unique)

  throwOnError(error)

  const map = new Map<string, TaskWeddingMeta>()
  for (const row of (data ?? []) as TaskWeddingMetaRow[]) {
    map.set(row.id, mapTaskWeddingMetaRow(row))
  }
  return map
}

/**
 * Active weddings for the Tasks Center association selector.
 * Rule: `status = 'active'` (excludes archived / cancelled).
 */
export async function listActiveTaskWeddingOptions(): Promise<TaskWeddingMeta[]> {
  const userId = await resolveStudioUserId()
  const { data, error } = await supabase
    .from('weddings')
    .select(TASKS_WEDDING_META_SELECT)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('wedding_date', { ascending: true, nullsFirst: false })

  throwOnError(error)

  return ((data ?? []) as TaskWeddingMetaRow[]).map(mapTaskWeddingMetaRow)
}

export function formatTaskWeddingOptionLabel(meta: TaskWeddingMeta): string {
  if (!meta.weddingDate) return meta.label
  const key = meta.weddingDate.slice(0, 10)
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return meta.label
  const date = new Date(y, m - 1, d).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${meta.label} — ${date}`
}

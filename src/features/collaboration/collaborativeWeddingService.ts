import { supabase } from '@/lib/supabase'
import { CollaborativeReadError, collaborativeReadError } from './collaborativeReadError'
import {
  isCollaborativePlaceRole,
  isValidOperationalClock,
  type CollaborativeWeddingCursor,
  type CollaborativeWeddingDetail,
  type CollaborativeWeddingListItem,
  type CollaborativeWeddingPlace,
} from './collaborativeWeddingTypes'

function mapListItem(value: unknown): CollaborativeWeddingListItem | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    typeof row.wedding_id !== 'string'
    || typeof row.couple_first_name !== 'string'
    || typeof row.couple_second_name !== 'string'
    || (row.wedding_date !== null && typeof row.wedding_date !== 'string')
  ) return null

  return {
    wedding_id: row.wedding_id,
    couple_first_name: row.couple_first_name,
    couple_second_name: row.couple_second_name,
    wedding_date: row.wedding_date,
  }
}

function mapDetail(value: unknown): CollaborativeWeddingDetail | null {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new CollaborativeReadError('UNKNOWN')

  const row = value as Record<string, unknown>
  if (
    typeof row.wedding_id !== 'string'
    || typeof row.couple_first_name !== 'string'
    || typeof row.couple_second_name !== 'string'
    || (row.wedding_date !== null && typeof row.wedding_date !== 'string')
    || !Array.isArray(row.places)
  ) throw new CollaborativeReadError('UNKNOWN')

  const places: CollaborativeWeddingPlace[] = []
  for (const rawPlace of row.places) {
    if (!rawPlace || typeof rawPlace !== 'object' || Array.isArray(rawPlace)) continue
    const place = rawPlace as Record<string, unknown>
    if (!isCollaborativePlaceRole(place.role) || typeof place.formatted_address !== 'string') continue
    places.push({
      role: place.role,
      formatted_address: place.formatted_address,
      operational_time: isValidOperationalClock(place.operational_time)
        ? place.operational_time
        : null,
    })
  }

  return {
    wedding_id: row.wedding_id,
    couple_first_name: row.couple_first_name,
    couple_second_name: row.couple_second_name,
    wedding_date: row.wedding_date,
    places,
  }
}

export const collaborativeWeddingService = {
  async listCollaborativeWeddings(cursor: CollaborativeWeddingCursor): Promise<CollaborativeWeddingListItem[]> {
    const { data, error } = await supabase.rpc('list_my_collaborative_weddings', {
      p_after_wedding_date: cursor.afterWeddingDate,
      p_after_wedding_id: cursor.afterWeddingId,
      p_limit: 50,
    })
    if (error) throw collaborativeReadError(error)
    if (!Array.isArray(data)) return []
    return data.map(mapListItem).filter((item): item is CollaborativeWeddingListItem => item !== null)
  },

  async getCollaborativeWeddingDetail(weddingId: string): Promise<CollaborativeWeddingDetail | null> {
    try {
      const { data, error } = await supabase.rpc('get_collaborative_wedding_detail', {
        p_wedding_id: weddingId,
      })
      if (error) throw collaborativeReadError(error)
      // The RPC's successful null result is its authoritative unavailable signal.
      return mapDetail(data)
    } catch (error) {
      if (error instanceof CollaborativeReadError) throw error
      throw collaborativeReadError(error)
    }
  },
}

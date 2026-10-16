import { supabase } from '@/lib/supabase'
import { CollaborativeReadError, collaborativeReadError } from './collaborativeReadError'
import type { CollaborativeWeddingIdentity } from './collaborativeWeddingIdentityTypes'

const IDENTITY_KEYS = ['couple_first_name', 'couple_second_name', 'wedding_date', 'wedding_id']

export function parseCollaborativeWeddingIdentity(
  value: unknown,
  requestedWeddingId: string,
): CollaborativeWeddingIdentity | null {
  if (value === null) return null
  if (!Array.isArray(value)) throw new CollaborativeReadError('UNKNOWN')
  if (value.length === 0) return null
  if (value.length !== 1) throw new CollaborativeReadError('UNKNOWN')

  const row = value[0]
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new CollaborativeReadError('UNKNOWN')
  const record = row as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== IDENTITY_KEYS.length || keys.some((key, index) => key !== IDENTITY_KEYS[index])) {
    throw new CollaborativeReadError('UNKNOWN')
  }
  if (typeof record.wedding_id !== 'string'
    || record.wedding_id.toLowerCase() !== requestedWeddingId.toLowerCase()
    || typeof record.couple_first_name !== 'string'
    || typeof record.couple_second_name !== 'string'
    || (record.wedding_date !== null && typeof record.wedding_date !== 'string')) {
    throw new CollaborativeReadError('UNKNOWN')
  }

  return {
    wedding_id: record.wedding_id,
    couple_first_name: record.couple_first_name,
    couple_second_name: record.couple_second_name,
    wedding_date: record.wedding_date,
  }
}

export const collaborativeWeddingIdentityService = {
  async getIdentity(weddingId: string): Promise<CollaborativeWeddingIdentity | null> {
    try {
      const { data, error } = await supabase.rpc('get_my_collaborative_wedding_identity', {
        p_wedding_id: weddingId,
      })
      if (error) throw collaborativeReadError(error)
      return parseCollaborativeWeddingIdentity(data, weddingId)
    } catch (error) {
      if (error instanceof CollaborativeReadError) throw error
      throw collaborativeReadError(error)
    }
  },
}

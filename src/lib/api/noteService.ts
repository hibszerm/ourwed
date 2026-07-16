import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type { WeddingNote } from '@/types/wedding'

interface NoteRow {
  id: string
  wedding_id: string
  author: string
  content: string
  pinned: boolean
  created_at: string
}

/** Map `public.notes` → app `WeddingNote`. */
export function mapNoteRowToModel(row: NoteRow): WeddingNote {
  return {
    id: row.id,
    content: row.content,
    createdAt: toDateString(row.created_at) || row.created_at,
    author: row.author,
    pinned: row.pinned,
  }
}

export interface CreateNoteInput {
  weddingId: string
  content: string
  author?: string
  pinned?: boolean
}

export interface UpdateNoteInput {
  content?: string
  author?: string
  pinned?: boolean
}

/**
 * Notes data layer — `public.notes` only.
 */
export const noteService = {
  async listByWeddingId(weddingId: string): Promise<WeddingNote[]> {
    const map = await this.listByWeddingIds([weddingId])
    return map.get(weddingId) ?? []
  },

  async listByWeddingIds(
    weddingIds: string[],
  ): Promise<Map<string, WeddingNote[]>> {
    const map = new Map<string, WeddingNote[]>()
    for (const id of weddingIds) map.set(id, [])
    if (weddingIds.length === 0) return map

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    throwOnError(error)

    for (const row of (data ?? []) as NoteRow[]) {
      const list = map.get(row.wedding_id) ?? []
      list.push(mapNoteRowToModel(row))
      map.set(row.wedding_id, list)
    }
    return map
  },

  async create(input: CreateNoteInput): Promise<WeddingNote> {
    const content = input.content.trim()
    if (!content) {
      throw new Error('Notatka nie może być pusta.')
    }

    const { data, error } = await supabase
      .from('notes')
      .insert({
        wedding_id: input.weddingId,
        author: input.author?.trim() || 'Studio',
        content,
        pinned: input.pinned ?? false,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zapisać notatki.')
    }

    return mapNoteRowToModel(data as NoteRow)
  },

  async update(id: string, input: UpdateNoteInput): Promise<WeddingNote> {
    const patch: Record<string, unknown> = {}
    if (input.content !== undefined) {
      const content = input.content.trim()
      if (!content) throw new Error('Notatka nie może być pusta.')
      patch.content = content
    }
    if (input.author !== undefined) patch.author = input.author.trim()
    if (input.pinned !== undefined) patch.pinned = input.pinned

    const { data, error } = await supabase
      .from('notes')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować notatki.')
    }

    return mapNoteRowToModel(data as NoteRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    throwOnError(error)
  },
}

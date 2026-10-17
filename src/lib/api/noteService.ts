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
  revision: string
}

/** Map `public.notes` → app `WeddingNote`. */
export function mapNoteRowToModel(row: NoteRow): WeddingNote {
  if (typeof row.revision !== 'string' || !/^[1-9][0-9]*$/.test(row.revision)) {
    throw new Error('Nie udało się odczytać wersji notatki.')
  }
  return {
    id: row.id,
    content: row.content,
    createdAt: toDateString(row.created_at) || row.created_at,
    author: row.author,
    pinned: row.pinned,
    revision: row.revision,
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
  pinned?: boolean
}

export class NoteRevisionConflictError extends Error {
  constructor() {
    super('Notatka została zmieniona przez inną osobę. Odświeżono jej aktualną wersję.')
    this.name = 'NoteRevisionConflictError'
  }
}

function throwNoteWriteError(error: { message: string } | null): void {
  if (error?.message?.includes('CONFLICT')) throw new NoteRevisionConflictError()
  throwOnError(error)
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

    await Promise.all(weddingIds.map(async (weddingId) => {
      const { data, error } = await supabase.rpc('get_my_owned_wedding_notes_v3', {
        p_wedding_id: weddingId,
      })
      throwOnError(error)

      if (!Array.isArray(data)) {
        throw new Error('Nie udało się odczytać notatek.')
      }
      map.set(weddingId, data.map((row) => mapNoteRowToModel(row as NoteRow)))
    }))
    return map
  },

  async create(input: CreateNoteInput): Promise<WeddingNote> {
    const content = input.content.trim()
    if (!content) {
      throw new Error('Notatka nie może być pusta.')
    }

    const { data, error } = await supabase.rpc('create_my_owned_wedding_note_v3', {
      p_wedding_id: input.weddingId,
      p_content: content,
      p_author: input.author?.trim() || 'Studio',
      p_pinned: input.pinned ?? false,
    })
    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zapisać notatki.')
    }

    return mapNoteRowToModel(data as NoteRow)
  },

  async update(weddingId: string, id: string, expectedRevision: string, input: UpdateNoteInput): Promise<WeddingNote> {
    const content = input.content?.trim()
    if (!content) throw new Error('Notatka nie może być pusta.')
    const { data, error } = await supabase.rpc('mutate_my_owned_wedding_note_v3', {
      p_action: 'update', p_wedding_id: weddingId, p_note_id: id,
      p_expected_revision: expectedRevision, p_content: content,
      p_pinned: input.pinned ?? false,
    })
    throwNoteWriteError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować notatki.')
    }

    return mapNoteRowToModel(data as NoteRow)
  },

  async delete(weddingId: string, id: string, expectedRevision: string): Promise<void> {
    const { error } = await supabase.rpc('mutate_my_owned_wedding_note_v3', {
      p_action: 'delete', p_wedding_id: weddingId, p_note_id: id,
      p_expected_revision: expectedRevision,
    })
    throwNoteWriteError(error)
  },
}

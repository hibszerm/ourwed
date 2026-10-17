import { supabase } from '@/lib/supabase'
import { toDateString } from '@/lib/supabase/helpers'
import type { WeddingNote } from '@/types/wedding'

export interface CollaborativeNotesAggregate {
  wedding_id: string
  access_version: string
  notes_level: 1 | 2
  notes: WeddingNote[]
}

export function collaborativeNotesQueryKey(actorId: string | undefined, weddingId: string, accessVersion: string) {
  return ['collaborative-wedding-notes-v3', actorId, weddingId, accessVersion] as const
}

export class CollaborativeNotesError extends Error {
  readonly kind: 'UNAVAILABLE' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR'

  constructor(kind: 'UNAVAILABLE' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR', message: string) {
    super(message)
    this.kind = kind
    this.name = 'CollaborativeNotesError'
  }
}

interface NoteProjection {
  id: string
  author: string
  content: string
  pinned: boolean
  created_at: string
  revision: string
}

function normalizeRpcError(error: { message?: string } | null): never {
  const message = error?.message ?? 'Nie udało się zapisać notatki.'
  const kind = (['UNAVAILABLE', 'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR'] as const)
    .find((candidate) => message.includes(candidate))
  if (kind) throw new CollaborativeNotesError(kind, message)
  throw new Error(message)
}

function mapProjection(row: NoteProjection): WeddingNote {
  if (!row || !exactKeys(row, ['id', 'author', 'content', 'pinned', 'created_at', 'revision'])
    || typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id)
    || typeof row.author !== 'string' || typeof row.content !== 'string'
    || typeof row.pinned !== 'boolean' || typeof row.created_at !== 'string'
    || !Number.isFinite(Date.parse(row.created_at))
    || typeof row.revision !== 'string' || !/^[1-9][0-9]*$/.test(row.revision)) {
    throw new CollaborativeNotesError('UNAVAILABLE', 'Nie udało się odczytać notatek.')
  }
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    pinned: row.pinned,
    createdAt: toDateString(row.created_at) || row.created_at,
    revision: row.revision,
  }
}

function exactKeys(value: object, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

export function parseCollaborativeNotesProjection(value: unknown, expectedWeddingId: string, expectedAccessVersion?: string): CollaborativeNotesAggregate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CollaborativeNotesError('UNAVAILABLE', 'Nie udało się odczytać notatek.')
  }
  const dto = value as Record<string, unknown>
  if (!exactKeys(dto, ['wedding_id', 'access_version', 'notes_level', 'notes'])
    || dto.wedding_id !== expectedWeddingId
    || typeof dto.access_version !== 'string' || !/^[1-9][0-9]*$/.test(dto.access_version)
    || (expectedAccessVersion !== undefined && dto.access_version !== expectedAccessVersion)
    || (dto.notes_level !== 1 && dto.notes_level !== 2)
    || !Array.isArray(dto.notes)) {
    throw new CollaborativeNotesError(expectedAccessVersion && dto.access_version !== expectedAccessVersion ? 'CONFLICT' : 'UNAVAILABLE', 'Nie udało się odczytać notatek.')
  }
  return {
    wedding_id: expectedWeddingId,
    access_version: dto.access_version,
    notes_level: dto.notes_level,
    notes: dto.notes.map((row) => mapProjection(row as NoteProjection)),
  }
}

export const collaborativeNotesService = {
  async get(weddingId: string, expectedAccessVersion?: string): Promise<CollaborativeNotesAggregate> {
    const { data, error } = await supabase.rpc('get_my_collaborative_wedding_notes_v3', { p_wedding_id: weddingId })
    if (error) normalizeRpcError(error)
    return parseCollaborativeNotesProjection(data, weddingId, expectedAccessVersion)
  },

  async create(input: { weddingId: string; accessVersion: string; content: string; pinned: boolean }): Promise<WeddingNote> {
    const { data, error } = await supabase.rpc('create_my_collaborative_wedding_note_v3', {
      p_wedding_id: input.weddingId, p_access_version: input.accessVersion,
      p_content: input.content, p_pinned: input.pinned,
    })
    if (error) normalizeRpcError(error)
    return mapProjection(data as NoteProjection)
  },

  async update(input: { weddingId: string; accessVersion: string; note: WeddingNote }): Promise<WeddingNote> {
    const { data, error } = await supabase.rpc('mutate_my_collaborative_wedding_note_v3', {
      p_action: 'update', p_wedding_id: input.weddingId, p_access_version: input.accessVersion,
      p_note_id: input.note.id, p_expected_revision: input.note.revision,
      p_content: input.note.content, p_pinned: Boolean(input.note.pinned),
    })
    if (error) normalizeRpcError(error)
    return mapProjection(data as NoteProjection)
  },

  async delete(input: { weddingId: string; accessVersion: string; note: WeddingNote }): Promise<void> {
    const { error } = await supabase.rpc('mutate_my_collaborative_wedding_note_v3', {
      p_action: 'delete', p_wedding_id: input.weddingId, p_access_version: input.accessVersion,
      p_note_id: input.note.id, p_expected_revision: input.note.revision,
    })
    if (error) normalizeRpcError(error)
  },
}

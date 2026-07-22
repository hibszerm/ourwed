import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import type {
  CreateClauseInput,
  DocumentClauseService,
} from '@/lib/api/documents/interfaces'
import { mapClause, type ClauseRow } from '@/lib/api/documents/mappers'
import type { DocumentClauseDef } from '@/types/documents'

export const documentClauseService: DocumentClauseService = {
  async list() {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_clause_defs')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    throwOnError(error)
    return ((data ?? []) as ClauseRow[]).map(mapClause)
  },

  async create(input: CreateClauseInput) {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_clause_defs')
      .insert({
        user_id: userId,
        key: input.key.trim(),
        title: input.title.trim(),
        body: input.body ?? '',
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapClause(data as ClauseRow)
  },

  async update(id, input) {
    const userId = await requireStudioUserId()
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.body !== undefined) patch.body = input.body
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
    const { data, error } = await supabase
      .from('document_clause_defs')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single()
    throwOnError(error)
    return mapClause(data as ClauseRow)
  },

  async remove(id) {
    const userId = await requireStudioUserId()
    const { error } = await supabase
      .from('document_clause_defs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    throwOnError(error)
  },
}

export type { DocumentClauseDef }

import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { assertWeddingOwned } from '@/lib/api/ownership'
import { VariableResolver } from '@/lib/variables'
import type {
  CreateDraftInput,
  DocumentDraftService,
  UpdateDraftInput,
} from '@/lib/api/documents/interfaces'
import { mapDraft, type DraftRow } from '@/lib/api/documents/mappers'

async function resolveDraftFieldValues(input: {
  base?: Record<string, string>
  packageSnapshot?: unknown
}) {
  return VariableResolver.resolve({
    base: input.base,
    packageSnapshot: input.packageSnapshot,
  })
}

export const documentDraftService: DocumentDraftService = {
  async listForWedding(weddingId) {
    await assertWeddingOwned(weddingId)
    const { data, error } = await supabase
      .from('wedding_document_drafts')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('updated_at', { ascending: false })
    throwOnError(error)
    return ((data ?? []) as DraftRow[]).map(mapDraft)
  },

  async get(id) {
    const { data, error } = await supabase
      .from('wedding_document_drafts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    if (!data) return null
    const draft = mapDraft(data as DraftRow)
    await assertWeddingOwned(draft.weddingId)
    draft.fieldValues = await resolveDraftFieldValues({
      base: draft.fieldValues,
      packageSnapshot: draft.packageSnapshot,
    })
    return draft
  },

  async create(input: CreateDraftInput) {
    await assertWeddingOwned(input.weddingId)
    const fieldValues = await resolveDraftFieldValues({
      base: input.fieldValues ?? {},
      packageSnapshot: input.packageSnapshot,
    })
    const { data, error } = await supabase
      .from('wedding_document_drafts')
      .insert({
        wedding_id: input.weddingId,
        template_id: input.templateId,
        template_version_id: input.templateVersionId,
        title: input.title.trim(),
        field_values: fieldValues,
        package_snapshot: input.packageSnapshot,
        enabled_clause_ids: input.enabledClauseIds ?? [],
        money: input.money,
        notes: input.notes ?? null,
        status: 'editing',
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapDraft(data as DraftRow)
  },

  async update(id, input: UpdateDraftInput) {
    const existing = await this.get(id)
    if (!existing) throw new Error('Szkic dokumentu nie istnieje.')

    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.fieldValues !== undefined || input.packageSnapshot !== undefined) {
      patch.field_values = await resolveDraftFieldValues({
        base: input.fieldValues ?? existing.fieldValues,
        packageSnapshot:
          input.packageSnapshot !== undefined
            ? input.packageSnapshot
            : existing.packageSnapshot,
      })
    }
    if (input.packageSnapshot !== undefined) {
      patch.package_snapshot = input.packageSnapshot
    }
    if (input.enabledClauseIds !== undefined) {
      patch.enabled_clause_ids = input.enabledClauseIds
    }
    if (input.money !== undefined) patch.money = input.money
    if (input.notes !== undefined) patch.notes = input.notes
    if (input.status !== undefined) patch.status = input.status

    const { data, error } = await supabase
      .from('wedding_document_drafts')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    throwOnError(error)
    const draft = mapDraft(data as DraftRow)
    draft.fieldValues = await resolveDraftFieldValues({
      base: draft.fieldValues,
      packageSnapshot: draft.packageSnapshot,
    })
    return draft
  },

  async remove(id) {
    const existing = await this.get(id)
    if (!existing) return
    const { error } = await supabase
      .from('wedding_document_drafts')
      .delete()
      .eq('id', id)
    throwOnError(error)
  },
}

import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError } from '@/lib/supabase/helpers'
import { assertWeddingOwned } from '@/lib/api/ownership'
import type {
  CreateExportRecordInput,
  DocumentExportService,
} from '@/lib/api/documents/interfaces'
import { mapExport, type ExportRow } from '@/lib/api/documents/mappers'
import { isDocumentLocked, type DocumentLockStatus } from '@/types/documents'

async function setLockStatus(id: string, lockStatus: DocumentLockStatus) {
  const existing = await documentExportService.get(id)
  if (!existing) throw new Error('Dokument nie istnieje.')
  if (isDocumentLocked(existing.lockStatus) && existing.lockStatus !== lockStatus) {
    // Already terminal — allow signed→locked style upgrades only via explicit statuses
    if (
      !(
        (existing.lockStatus === 'finalized' || existing.lockStatus === 'signed') &&
        lockStatus === 'locked'
      )
    ) {
      throw new Error('Dokument jest zablokowany — utwórz nową wersję.')
    }
  }

  const { data, error } = await supabase
    .from('wedding_documents')
    .update({
      lock_status: lockStatus,
      locked_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single()
  throwOnError(error)
  return mapExport(data as ExportRow)
}

export const documentExportService: DocumentExportService = {
  async listForWedding(weddingId) {
    await assertWeddingOwned(weddingId)
    const { data, error } = await supabase
      .from('wedding_documents')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('created_at', { ascending: false })
    throwOnError(error)
    return ((data ?? []) as ExportRow[]).map(mapExport)
  },

  async get(id) {
    const { data, error } = await supabase
      .from('wedding_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    if (!data) return null
    const doc = mapExport(data as ExportRow)
    await assertWeddingOwned(doc.weddingId)
    return doc
  },

  async recordExport(input: CreateExportRecordInput) {
    await assertWeddingOwned(input.weddingId)
    const { data, error } = await supabase
      .from('wedding_documents')
      .insert({
        wedding_id: input.weddingId,
        template_id: input.templateId,
        template_version_id: input.templateVersionId,
        draft_id: input.draftId,
        version_number: input.versionNumber,
        format: input.format,
        file_path: input.filePath,
        file_name: input.fileName,
        snapshot_json: input.snapshotJson,
        lock_status: 'exported',
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapExport(data as ExportRow)
  },

  async finalize(id) {
    return setLockStatus(id, 'finalized')
  },

  async markSigned(id) {
    return setLockStatus(id, 'signed')
  },

  async lock(id) {
    return setLockStatus(id, 'locked')
  },
}

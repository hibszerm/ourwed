import { throwOnError } from '@/lib/supabase/helpers'
import { assertWeddingOwned, requireStudioUserId } from '@/lib/api/ownership'
import { documentStorage } from '@/lib/api/documents/storage'
import { supabase } from '@/lib/supabase'
import { devWarnArgs } from '@/lib/debug/devConsole'

export type WeddingBriefRecord = {
  id: string
  weddingId: string
  filePath: string
  fileName: string
  sourceHash: string
  generatorVersion: number
  generatedAt: string
  byteSize: number | null
}

export type PersistWeddingBriefInput = {
  weddingId: string
  filePath: string
  fileName: string
  sourceHash: string
  generatorVersion: number
  generatedAt: string
  byteSize: number | null
}

interface WeddingBriefRow {
  id: string
  wedding_id: string
  file_path: string
  file_name: string
  source_hash: string
  generator_version: number
  generated_at: string
  byte_size: number | string | null
}

function mapRow(row: WeddingBriefRow): WeddingBriefRecord {
  const size =
    row.byte_size == null || row.byte_size === ''
      ? null
      : Number(row.byte_size)
  return {
    id: row.id,
    weddingId: row.wedding_id,
    filePath: row.file_path,
    fileName: row.file_name,
    sourceHash: row.source_hash,
    generatorVersion: Number(row.generator_version),
    generatedAt: row.generated_at,
    byteSize: Number.isFinite(size) ? size : null,
  }
}

export function weddingBriefStoragePath(
  userId: string,
  weddingId: string,
  briefFileId: string,
): string {
  return `${userId}/weddings/${weddingId}/briefs/${briefFileId}.pdf`
}

export const weddingBriefService = {
  async getCurrent(weddingId: string): Promise<WeddingBriefRecord | null> {
    await assertWeddingOwned(weddingId)
    const { data, error } = await supabase
      .from('wedding_briefs')
      .select(
        'id, wedding_id, file_path, file_name, source_hash, generator_version, generated_at, byte_size',
      )
      .eq('wedding_id', weddingId)
      .maybeSingle()
    throwOnError(error)
    if (!data) return null
    return mapRow(data as WeddingBriefRow)
  },

  async persistCurrent(input: PersistWeddingBriefInput): Promise<WeddingBriefRecord> {
    await assertWeddingOwned(input.weddingId)
    const { data, error } = await supabase
      .from('wedding_briefs')
      .upsert(
        {
          wedding_id: input.weddingId,
          file_path: input.filePath,
          file_name: input.fileName,
          source_hash: input.sourceHash,
          generator_version: input.generatorVersion,
          generated_at: input.generatedAt,
          byte_size: input.byteSize,
        },
        { onConflict: 'wedding_id' },
      )
      .select(
        'id, wedding_id, file_path, file_name, source_hash, generator_version, generated_at, byte_size',
      )
      .single()
    throwOnError(error)
    return mapRow(data as WeddingBriefRow)
  },

  async uploadPdf(path: string, bytes: ArrayBuffer): Promise<void> {
    await documentStorage.upload(
      path,
      new Blob([bytes], { type: 'application/pdf' }),
      'application/pdf',
    )
  },

  async downloadPdf(path: string): Promise<ArrayBuffer> {
    return documentStorage.download(path)
  },

  async removeFile(path: string): Promise<void> {
    await documentStorage.remove(path)
  },

  async tryRemoveFile(path: string, reason: string): Promise<void> {
    try {
      await documentStorage.remove(path)
    } catch (error) {
      devWarnArgs('[wedding-brief] storage cleanup failed', {
        reason,
        path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },

  async studioUserId(): Promise<string> {
    return requireStudioUserId()
  },
}

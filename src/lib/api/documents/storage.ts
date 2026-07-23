import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import type { DocumentStorageService } from '@/lib/api/documents/interfaces'
import type { DocumentExportFormat } from '@/types/documents'

const BUCKET = 'document-files'

function safeName(fileName: string): string {
  return fileName.replace(/[^\w.\-]+/g, '_')
}

export const documentStorage: DocumentStorageService = {
  paths: {
    templateSource(userId, templateId, versionNumber) {
      return `${userId}/templates/${templateId}/v${versionNumber}/source.docx`
    },
    templateFillable(userId, templateId, versionNumber) {
      return `${userId}/templates/${templateId}/v${versionNumber}/template.docx`
    },
    draftAsset(userId, weddingId, draftId, fileName) {
      return `${userId}/weddings/${weddingId}/drafts/${draftId}/${safeName(fileName)}`
    },
    exportFile(userId, weddingId, documentId, format: DocumentExportFormat) {
      return `${userId}/weddings/${weddingId}/exports/${documentId}.${format}`
    },
  },

  async upload(path, file, contentType) {
    await requireStudioUserId()
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType:
        contentType ??
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    throwOnError(error)
  },

  async download(path) {
    await requireStudioUserId()
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    throwOnError(error)
    if (!data) throw new Error('Nie udało się pobrać pliku.')
    return data.arrayBuffer()
  },

  async remove(path) {
    await requireStudioUserId()
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    throwOnError(error)
  },

  async signedUrl(path, expiresInSeconds = 600) {
    await requireStudioUserId()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds)
    throwOnError(error)
    if (!data?.signedUrl) throw new Error('Nie udało się utworzyć linku.')
    return data.signedUrl
  },
}

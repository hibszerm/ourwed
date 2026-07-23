/**
 * In-memory handoff from Templates list → import wizard.
 * Supports pending create (before template id) and post-create cache.
 */

export type AttachedImportMeta = {
  fileName: string
  fileSize: number
  mimeType: string
}

export type PendingNewImport = {
  file: File
  /** Filled lazily during prepare if null. */
  bytes: ArrayBuffer | null
  meta: AttachedImportMeta
}

const bytesByTemplate = new Map<string, ArrayBuffer>()
const metaByTemplate = new Map<string, AttachedImportMeta>()
let pendingNewImport: PendingNewImport | null = null

/** Instant handoff — do not await arrayBuffer before navigating. */
export function setPendingNewImport(file: File): void {
  pendingNewImport = {
    file,
    bytes: null,
    meta: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || '',
    },
  }
}

export function takePendingNewImport(): PendingNewImport | null {
  const next = pendingNewImport
  pendingNewImport = null
  return next
}

export function peekPendingNewImport(): PendingNewImport | null {
  return pendingNewImport
}

export function cacheAttachedImport(
  templateId: string,
  file: File,
  bytes: ArrayBuffer,
): void {
  bytesByTemplate.set(templateId, bytes)
  metaByTemplate.set(templateId, {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || '',
  })
}

export function peekAttachedImportBytes(
  templateId: string,
): ArrayBuffer | null {
  return bytesByTemplate.get(templateId) ?? null
}

export function peekAttachedImportMeta(
  templateId: string,
): AttachedImportMeta | null {
  return metaByTemplate.get(templateId) ?? null
}

export function clearAttachedImport(templateId: string): void {
  bytesByTemplate.delete(templateId)
  metaByTemplate.delete(templateId)
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

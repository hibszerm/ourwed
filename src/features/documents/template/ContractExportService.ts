import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import type {
  CreateExportRecordInput,
  DocumentStorageService,
} from '@/lib/api/documents/interfaces'
import type { WeddingDocument } from '@/types/documents'
import { sanitizeContractFileName } from './contractArtifactDomain'

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_CONTENT_TYPE = 'application/pdf'

export const PDF_EXPORT_UNAVAILABLE_MESSAGE =
  'Eksport PDF wymaga konfiguracji usługi konwersji'

export interface PdfConversionAdapter {
  convertDocx(input: {
    docxBytes: ArrayBuffer
    fileName: string
  }): Promise<ArrayBuffer>
}

export interface PersistedContractArtifact {
  document: WeddingDocument
  downloadUrl: string
  bytes: ArrayBuffer
}

interface ContractExportDependencies {
  storage: DocumentStorageService
  recordExport: (
    input: CreateExportRecordInput,
  ) => Promise<WeddingDocument>
  getUserId: () => Promise<string>
  pdfAdapter?: PdfConversionAdapter
}

export async function assertRealDocx(bytes: ArrayBuffer): Promise<void> {
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  if (
    signature.length < 4 ||
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b
  ) {
    throw new Error('Wygenerowany plik nie jest prawidłowym dokumentem DOCX.')
  }
  try {
    const zip = await JSZip.loadAsync(bytes)
    if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) {
      throw new Error('missing OOXML parts')
    }
  } catch {
    throw new Error('Wygenerowany plik nie jest prawidłowym dokumentem DOCX.')
  }
}

function assertRealPdf(bytes: ArrayBuffer): void {
  const prefix = new TextDecoder().decode(
    new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)),
  )
  if (prefix !== '%PDF-') {
    throw new Error('Usługa konwersji nie zwróciła prawidłowego pliku PDF.')
  }
}

export function createContractExportService(
  dependencies: ContractExportDependencies,
) {
  async function persist(input: {
    weddingId: string
    draftId: string
    templateId: string
    templateVersionId: string
    generationVersion: number
    title: string
    format: 'docx' | 'pdf'
    bytes: ArrayBuffer
    snapshotJson: Record<string, unknown>
    contentType: string
  }): Promise<PersistedContractArtifact> {
    const userId = await dependencies.getUserId()
    const baseName = sanitizeContractFileName(input.title)
    const fileName = `${baseName}-v${input.generationVersion}.${input.format}`
    const path = dependencies.storage.paths.exportFile(
      userId,
      input.weddingId,
      `${input.draftId}-v${input.generationVersion}`,
      input.format,
    )
    await dependencies.storage.upload(
      path,
      new Blob([cloneArrayBuffer(input.bytes)], { type: input.contentType }),
      input.contentType,
    )

    let document: WeddingDocument
    try {
      document = await dependencies.recordExport({
        weddingId: input.weddingId,
        draftId: input.draftId,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        versionNumber: input.generationVersion,
        format: input.format,
        filePath: path,
        fileName,
        snapshotJson: input.snapshotJson,
      })
    } catch (error) {
      try {
        await dependencies.storage.remove(path)
      } catch {
        // Preserve the record failure. An unreferenced object can be cleaned later.
      }
      throw error
    }

    const downloadUrl = await dependencies.storage.signedUrl(path, 3600)
    return {
      document,
      downloadUrl,
      bytes: cloneArrayBuffer(input.bytes),
    }
  }

  return {
    pdfAvailable: Boolean(dependencies.pdfAdapter),

    async generateDocx(input: {
      weddingId: string
      draftId: string
      templateId: string
      templateVersionId: string
      generationVersion: number
      title: string
      docxBytes: ArrayBuffer
      snapshotJson: Record<string, unknown>
    }): Promise<PersistedContractArtifact> {
      await assertRealDocx(input.docxBytes)
      return persist({
        ...input,
        format: 'docx',
        bytes: input.docxBytes,
        contentType: DOCX_CONTENT_TYPE,
      })
    },

    async generatePdf(input: {
      weddingId: string
      draftId: string
      templateId: string
      templateVersionId: string
      generationVersion: number
      title: string
      docxBytes: ArrayBuffer
      snapshotJson: Record<string, unknown>
    }): Promise<PersistedContractArtifact> {
      if (!dependencies.pdfAdapter) {
        throw new Error(PDF_EXPORT_UNAVAILABLE_MESSAGE)
      }
      const pdfBytes = await dependencies.pdfAdapter.convertDocx({
        docxBytes: cloneArrayBuffer(input.docxBytes),
        fileName: `${sanitizeContractFileName(input.title)}.docx`,
      })
      assertRealPdf(pdfBytes)
      return persist({
        ...input,
        format: 'pdf',
        bytes: pdfBytes,
        contentType: PDF_CONTENT_TYPE,
      })
    },
  }
}

const lazyDocumentStorage: DocumentStorageService = {
  paths: {
    templateSource(userId, templateId, versionNumber) {
      return `${userId}/templates/${templateId}/v${versionNumber}/source.docx`
    },
    templateFillable(userId, templateId, versionNumber) {
      return `${userId}/templates/${templateId}/v${versionNumber}/template.docx`
    },
    draftAsset(userId, weddingId, draftId, fileName) {
      return `${userId}/weddings/${weddingId}/drafts/${draftId}/${fileName}`
    },
    exportFile(userId, weddingId, documentId, format) {
      return `${userId}/weddings/${weddingId}/exports/${documentId}.${format}`
    },
  },
  async upload(...args) {
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.upload(...args)
  },
  async download(...args) {
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.download(...args)
  },
  async remove(...args) {
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.remove(...args)
  },
  async signedUrl(...args) {
    const { documentStorage } = await import('@/lib/api/documents/storage')
    return documentStorage.signedUrl(...args)
  },
}

export const ContractExportService = createContractExportService({
  storage: lazyDocumentStorage,
  async recordExport(input) {
    const { documentExportService } = await import('@/lib/api/documents')
    return documentExportService.recordExport(input)
  },
  async getUserId() {
    const { requireStudioUserId } = await import('@/lib/api/ownership')
    return requireStudioUserId()
  },
})

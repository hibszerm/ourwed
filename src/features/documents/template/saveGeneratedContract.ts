/**
 * Persist generated contract DOCX (+ optional PDF print HTML) to storage/exports.
 */

import { documentStorage } from '@/lib/api/documents/storage'
import { documentExportService } from '@/lib/api/documents'
import { requireStudioUserId } from '@/lib/api/ownership'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import {
  extractDocxParagraphs,
  paragraphsToPrintHtml,
} from './docxParagraphEditor'

export interface SaveGeneratedContractInput {
  weddingId: string
  draftId: string
  templateId: string
  templateVersionId: string
  versionNumber: number
  title: string
  docxBytes: ArrayBuffer
}

export interface SaveGeneratedContractResult {
  docxPath: string
  docxDownloadUrl: string
  pdfHtmlPath: string | null
  pdfDownloadUrl: string | null
  docxExportId: string | null
  pdfExportId: string | null
}

function safeFile(name: string): string {
  return name.replace(/[^\w.\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]+/gi, '_').slice(0, 80)
}

export async function saveGeneratedContract(
  input: SaveGeneratedContractInput,
): Promise<SaveGeneratedContractResult> {
  const userId = await requireStudioUserId()
  const base = safeFile(input.title) || 'umowa'

  const docxPath = documentStorage.paths.draftAsset(
    userId,
    input.weddingId,
    input.draftId,
    'contract.docx',
  )
  const docxBlob = new Blob([cloneArrayBuffer(input.docxBytes)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  try {
    await documentStorage.remove(docxPath)
  } catch {
    /* first write */
  }
  await documentStorage.upload(
    docxPath,
    docxBlob,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )

  let docxExportId: string | null = null
  try {
    const exported = await documentExportService.recordExport({
      weddingId: input.weddingId,
      draftId: input.draftId,
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
      versionNumber: input.versionNumber,
      format: 'docx',
      filePath: docxPath,
      fileName: `${base}.docx`,
      snapshotJson: { kind: 'contract_reproduction' },
    })
    docxExportId = exported.id
  } catch {
    docxExportId = null
  }

  let pdfHtmlPath: string | null = null
  let pdfExportId: string | null = null
  let pdfDownloadUrl: string | null = null

  try {
    const paragraphs = await extractDocxParagraphs(input.docxBytes)
    const html = paragraphsToPrintHtml(input.title, paragraphs)
    pdfHtmlPath = documentStorage.paths.draftAsset(
      userId,
      input.weddingId,
      input.draftId,
      'contract-print.html',
    )
    const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' })
    try {
      await documentStorage.remove(pdfHtmlPath)
    } catch {
      /* first write */
    }
    await documentStorage.upload(pdfHtmlPath, htmlBlob, 'text/html')

    const pdfPath = documentStorage.paths.exportFile(
      userId,
      input.weddingId,
      input.draftId,
      'pdf',
    )
    // Store print-ready HTML under the PDF export path for download + print-to-PDF.
    try {
      await documentStorage.remove(pdfPath)
    } catch {
      /* ok */
    }
    await documentStorage.upload(pdfPath, htmlBlob, 'text/html')

    try {
      const exported = await documentExportService.recordExport({
        weddingId: input.weddingId,
        draftId: input.draftId,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        versionNumber: input.versionNumber,
        format: 'pdf',
        filePath: pdfPath,
        fileName: `${base}.pdf.html`,
        snapshotJson: {
          kind: 'contract_print_html',
          note: 'Open and use Print → Save as PDF for a PDF file.',
        },
      })
      pdfExportId = exported.id
    } catch {
      pdfExportId = null
    }

    pdfDownloadUrl = await documentStorage.signedUrl(pdfPath, 3600)
  } catch {
    pdfHtmlPath = null
    pdfExportId = null
    pdfDownloadUrl = null
  }

  const docxDownloadUrl = await documentStorage.signedUrl(docxPath, 3600)

  return {
    docxPath,
    docxDownloadUrl,
    pdfHtmlPath,
    pdfDownloadUrl,
    docxExportId,
    pdfExportId,
  }
}

/** Open print-ready HTML in a new window and trigger the browser print dialog (Save as PDF). */
export function printHtmlAsPdf(html: string): void {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) {
    throw new Error(
      'Przeglądarka zablokowała okno drukowania. Zezwól na wyskakujące okna.',
    )
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  window.setTimeout(() => {
    win.print()
  }, 250)
}

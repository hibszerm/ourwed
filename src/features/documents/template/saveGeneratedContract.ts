import type { PersistGeneratedWeddingContractInput } from './ContractArtifactPersistenceService'
import { ContractArtifactPersistenceService } from './ContractArtifactPersistenceService'

export type SaveGeneratedContractInput = PersistGeneratedWeddingContractInput

export interface SaveGeneratedContractResult {
  generationVersion: number
  docxPath: string
  docxDownloadUrl: string
  docxExportId: string
  pdfAvailable: boolean
  pdfPath: string | null
  pdfDownloadUrl: string | null
  pdfError: string | null
}

export async function saveGeneratedContract(
  input: SaveGeneratedContractInput,
): Promise<SaveGeneratedContractResult> {
  const saved = await ContractArtifactPersistenceService.persist(input)
  return {
    generationVersion: saved.generationVersion,
    docxPath: saved.docx.document.filePath,
    docxDownloadUrl: saved.docx.downloadUrl,
    docxExportId: saved.docx.document.id,
    pdfAvailable: saved.pdfAvailable,
    pdfPath: saved.pdf?.document.filePath ?? null,
    pdfDownloadUrl: saved.pdf?.downloadUrl ?? null,
    pdfError: saved.pdfError,
  }
}

/** Legacy browser print action. It does not create or persist a PDF artifact. */
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

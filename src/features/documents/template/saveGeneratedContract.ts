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
  let resolvedValues = input.resolvedValues
  // Sparse generation used to persist resolvedValues: {}. Freshness compares that
  // bag to a live resolveContractVariables run, so empty vs full stayed forever
  // stale — including after regenerate. Fill from the same resolver used by the
  // freshness check when the generation bag is empty.
  if (Object.keys(resolvedValues).length === 0) {
    const { resolveContractVariables } = await import('./resolveContractVariables')
    const live = await resolveContractVariables({
      wedding: input.wedding,
      overrides: input.manualOverrides,
      executionSnapshot: input.executionSnapshot
        ? {
            contractExecutionDate:
              input.executionSnapshot.contractExecutionDate ?? '',
            contractExecutionCity:
              input.executionSnapshot.contractExecutionCity ?? '',
          }
        : null,
    })
    resolvedValues = live.resolved
  }
  const saved = await ContractArtifactPersistenceService.persist({
    ...input,
    resolvedValues,
  })
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

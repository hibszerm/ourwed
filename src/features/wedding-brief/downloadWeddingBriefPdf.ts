import { downloadPdfBytes } from '@/features/wedding-brief/convertWeddingBriefHtmlToPdf'
import {
  BriefSourceChangedError,
  weddingBriefWorkflow,
} from '@/features/wedding-brief/weddingBriefWorkflow'
import { weddingBriefService } from '@/lib/api/weddingBriefService'

export { BriefSourceChangedError }

/** Download the persisted Brief. Never generates. Never calls pdf-render. */
export async function downloadStoredWeddingBriefPdf(weddingId: string): Promise<void> {
  const record = await weddingBriefService.getCurrent(weddingId)
  if (!record) {
    throw new Error('Brak zapisanego briefu PDF.')
  }
  const bytes = await weddingBriefService.downloadPdf(record.filePath)
  downloadPdfBytes(bytes, record.fileName)
}

/** Generate, persist, then download the new bytes. Calls PDFShift once. */
export async function generateWeddingBriefPdf(weddingId: string): Promise<void> {
  const generated = await weddingBriefWorkflow.generateAndPersist(weddingId)
  downloadPdfBytes(generated.bytes, generated.fileName)
}

/**
 * Primary Brief action used by the shared hook.
 * `download` must never invoke PDFShift / HTML rendering.
 */
export async function runWeddingBriefPrimaryAction(
  weddingId: string,
  mode: 'download' | 'generate',
): Promise<void> {
  if (mode === 'download') {
    await downloadStoredWeddingBriefPdf(weddingId)
    return
  }
  await generateWeddingBriefPdf(weddingId)
}

/** @deprecated Use runWeddingBriefPrimaryAction — kept as the historical export name. */
export async function downloadWeddingBriefPdf(weddingId: string): Promise<void> {
  await runWeddingBriefPrimaryAction(weddingId, 'generate')
}

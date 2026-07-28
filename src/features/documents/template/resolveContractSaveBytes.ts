/**
 * Resolve exact DOCX bytes to persist — never re-run generation or corrupt insertions.
 */

import { applyDocxParagraphEdits } from './docxParagraphEditor'
import type { DocxParagraph } from './docxParagraphEditor'
import {
  assertSaveArtifactConsistency,
  ContractArtifactVersionMismatchError,
  paragraphsTextChanged,
} from './finalContractGenerationArtifact'
import type { TransformContractResult } from './ContractTransformationService'

export type ResolveContractSaveBytesResult = {
  bytes: ArrayBuffer
  editsApplied: boolean
}

export async function resolveContractSaveBytes(input: {
  docxBytes: ArrayBuffer | null
  generated: TransformContractResult
  currentParagraphs: DocxParagraph[]
}): Promise<ResolveContractSaveBytesResult> {
  if (!input.docxBytes || input.docxBytes.byteLength === 0) {
    throw new Error(
      'Wygenerowany dokument nie jest już dostępny. Wygeneruj umowę ponownie przed zapisaniem.',
    )
  }

  const paragraphsChanged = paragraphsTextChanged(
    input.currentParagraphs,
    input.generated.paragraphs,
  )

  if (!paragraphsChanged) {
    if (input.generated.finalArtifact) {
      await assertSaveArtifactConsistency({
        previewArtifact: input.generated.finalArtifact,
        saveArtifact: input.generated.finalArtifact,
        previewDocxBytes: input.docxBytes,
      })
    }
    return { bytes: input.docxBytes, editsApplied: false }
  }

  try {
    const bytes = await applyDocxParagraphEdits(
      input.docxBytes,
      input.currentParagraphs.map((paragraph) => ({
        index: paragraph.index,
        text: paragraph.text,
      })),
    )
    return { bytes, editsApplied: true }
  } catch (err) {
    if (err instanceof ContractArtifactVersionMismatchError) throw err
    throw err
  }
}

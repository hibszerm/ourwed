/**
 * Immutable final contract generation artifact — shared by preview, save, and PDF.
 */

import type { ContractParagraphInsertion } from '@/features/ai-contract-transform/expandBlocksWithInsertions'
import type { TransformedBlock } from '@/features/ai-contract-transform/types'
import { hashBytes, hashDocumentText } from '@/features/documents/ai/hash'
import type { DocxParagraph } from './docxParagraphEditor'

export const CONTRACT_ARTIFACT_VERSION_MISMATCH = 'CONTRACT_ARTIFACT_VERSION_MISMATCH'

export class ContractArtifactVersionMismatchError extends Error {
  readonly code = CONTRACT_ARTIFACT_VERSION_MISMATCH

  constructor(message: string) {
    super(message)
    this.name = 'ContractArtifactVersionMismatchError'
  }
}

export type FinalContractGenerationArtifact = {
  generationId: string
  finalBlocksHash: string
  paragraphInsertionsHash: string
  finalDocxHash: string
  paragraphInsertions: ContractParagraphInsertion[]
  generatedAt: string
  sourceTemplateVersionId: string
  datasetFingerprint: string
}

export function createGenerationId(): string {
  return crypto.randomUUID()
}

export async function hashFinalBlocks(
  blocks: Array<{ blockId: string; text: string }>,
): Promise<string> {
  const payload = blocks.map((b) => `${b.blockId}\u0000${b.text}`).join('\u0001')
  return hashDocumentText(payload)
}

export async function hashParagraphInsertions(
  insertions: ContractParagraphInsertion[],
): Promise<string> {
  const payload = JSON.stringify(
    insertions.map((ins) => ({
      afterParagraphIndex: ins.afterParagraphIndex,
      paragraphs: ins.paragraphs,
    })),
  )
  return hashDocumentText(payload)
}

export async function buildFinalContractGenerationArtifact(input: {
  generationId?: string
  sourceTemplateVersionId: string
  datasetFingerprint: string
  finalBlocks: TransformedBlock[]
  paragraphInsertions: ContractParagraphInsertion[]
  docxBytes: ArrayBuffer
  generatedAt?: string
}): Promise<FinalContractGenerationArtifact> {
  const [finalBlocksHash, paragraphInsertionsHash, finalDocxHash] =
    await Promise.all([
      hashFinalBlocks(input.finalBlocks),
      hashParagraphInsertions(input.paragraphInsertions),
      hashBytes(input.docxBytes),
    ])

  return {
    generationId: input.generationId ?? createGenerationId(),
    finalBlocksHash,
    paragraphInsertionsHash,
    finalDocxHash,
    paragraphInsertions: input.paragraphInsertions,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceTemplateVersionId: input.sourceTemplateVersionId,
    datasetFingerprint: input.datasetFingerprint,
  }
}

export async function refreshFinalDocxHash(
  artifact: FinalContractGenerationArtifact,
  docxBytes: ArrayBuffer,
): Promise<FinalContractGenerationArtifact> {
  return {
    ...artifact,
    finalDocxHash: await hashBytes(docxBytes),
  }
}

export function paragraphsTextChanged(
  current: DocxParagraph[],
  baseline: DocxParagraph[],
): boolean {
  if (current.length !== baseline.length) return true
  for (let i = 0; i < current.length; i++) {
    if (current[i]!.index !== baseline[i]!.index) return true
    if (current[i]!.text !== baseline[i]!.text) return true
  }
  return false
}

export async function assertSaveArtifactConsistency(input: {
  previewArtifact: FinalContractGenerationArtifact | null | undefined
  saveArtifact: FinalContractGenerationArtifact | null | undefined
  previewDocxBytes: ArrayBuffer | null
}): Promise<void> {
  if (!input.previewDocxBytes || input.previewDocxBytes.byteLength === 0) {
    throw new Error(
      'Wygenerowany dokument nie jest już dostępny. Wygeneruj umowę ponownie przed zapisaniem.',
    )
  }

  if (!input.previewArtifact || !input.saveArtifact) return

  if (input.previewArtifact.generationId !== input.saveArtifact.generationId) {
    throw new ContractArtifactVersionMismatchError(
      `${CONTRACT_ARTIFACT_VERSION_MISMATCH}: generationId mismatch`,
    )
  }

  const currentHash = await hashBytes(input.previewDocxBytes)
  if (currentHash !== input.previewArtifact.finalDocxHash) {
    throw new ContractArtifactVersionMismatchError(
      `${CONTRACT_ARTIFACT_VERSION_MISMATCH}: finalDocxHash mismatch`,
    )
  }
}

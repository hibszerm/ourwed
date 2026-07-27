/**
 * Mode A — warnings-only diagnostics (never blocks download).
 */

import { computeTextEdits, textSimilarity } from './blockDiffEngine'
import { classifyBlockDiff } from './changeClassifier'
import { findMissingProtectedValues } from './protectedContractData'
import type {
  ContractBlockDiff,
  ContractTransformationDataset,
  ModeADiagnostics,
  ProtectedContractData,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'

export function buildModeADiagnostics(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
}): { diagnostics: ModeADiagnostics; diffs: ContractBlockDiff[] } {
  const srcIds = input.sourceBlocks.map((b) => b.blockId)
  const outIds = input.transformedBlocks.map((b) => b.blockId)
  const srcSet = new Set(srcIds)
  const outSet = new Set(outIds)

  const blocksAdded = outIds.filter((id) => !srcSet.has(id))
  const blocksRemoved = srcIds.filter((id) => !outSet.has(id))
  let blocksReordered = false
  const common = Math.min(srcIds.length, outIds.length)
  for (let i = 0; i < common; i++) {
    if (srcIds[i] !== outIds[i]) {
      blocksReordered = true
      break
    }
  }

  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))
  const diffs: ContractBlockDiff[] = []
  let changedBlockCount = 0
  let unchangedBlockCount = 0
  let protectedValuesChanged = 0
  let unexpectedNumbersChanged = 0
  let broaderEditSentenceCount = 0
  let simSum = 0
  let simCount = 0

  for (const src of input.sourceBlocks) {
    const transformed = byId.get(src.blockId)
    if (transformed === undefined) {
      changedBlockCount += 1
      continue
    }
    simSum += textSimilarity(src.text, transformed)
    simCount += 1
    if (transformed === src.text) {
      unchangedBlockCount += 1
      continue
    }
    changedBlockCount += 1
    const rawEdits = computeTextEdits(src.text, transformed)
    const diff = classifyBlockDiff({
      sourceText: src.text,
      transformedText: transformed,
      blockId: src.blockId,
      paragraphIndex: src.paragraphIndex,
      dataset: input.dataset,
      protectedData: input.protectedData,
      mode: 'full_ai',
      rawEdits,
      sourceBlock: src,
    })
    diffs.push(diff)
    for (const c of diff.changes) {
      if (c.classification === 'protected_value_change') protectedValuesChanged += 1
      if (c.classification === 'unexpected_number_change') {
        unexpectedNumbersChanged += 1
      }
      if (c.classification === 'sentence_structure_change') {
        broaderEditSentenceCount += 1
      }
    }
  }

  const fullOut = input.transformedBlocks.map((b) => b.text).join('\n')
  const missingProtected = findMissingProtectedValues(
    input.protectedData,
    fullOut,
  )
  protectedValuesChanged += missingProtected.length

  const warnings: string[] = []
  if (blocksAdded.length) warnings.push(`Dodano bloki: ${blocksAdded.length}`)
  if (blocksRemoved.length) warnings.push(`Usunięto bloki: ${blocksRemoved.length}`)
  if (blocksReordered) warnings.push('Zmieniono kolejność bloków')
  if (protectedValuesChanged) {
    warnings.push(
      `Wykryto zmiany chronionych wartości: ${protectedValuesChanged}`,
    )
  }
  if (unexpectedNumbersChanged) {
    warnings.push(`Nieoczekiwane zmiany liczb: ${unexpectedNumbersChanged}`)
  }
  if (broaderEditSentenceCount) {
    warnings.push(`Szersze edycje zdań: ${broaderEditSentenceCount}`)
  }

  return {
    diagnostics: {
      blocksAdded,
      blocksRemoved,
      blocksReordered,
      changedBlockCount,
      unchangedBlockCount,
      protectedValuesChanged,
      unexpectedNumbersChanged,
      broaderEditSentenceCount,
      textSimilarity: simCount ? simSum / simCount : 1,
      warnings,
    },
    diffs,
  }
}

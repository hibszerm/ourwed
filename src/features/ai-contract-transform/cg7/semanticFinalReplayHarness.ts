/** Offline Golden replay only. Production generation does not import this module. */
import assert from 'node:assert/strict'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { writeTransformedDocx } from '@/features/ai-contract-transform/docxTransformWriter'
import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'
import {
  extractSemanticParagraphTextSlots,
  reconstructSemanticSpanAuditText,
  semanticParagraphBreakOffsets,
  type SemanticSpanReplayAuditEdit,
} from './semanticSpanReplayAudit'
import type { ContractParagraphInsertion } from '@/features/ai-contract-transform/expandBlocksWithInsertions'
import type { TransformDocumentBlock, TransformedBlock } from '@/features/ai-contract-transform/types'

type GroundedSpan = {
  sourceBlockId: string
  span: { start: number; end: number; segments?: readonly { start: number; end: number }[] }
}

export function auditSemanticReplayParagraph(input: {
  sourceParagraphXml: string
  outputParagraphXml: string
  blockId: string
  edits: readonly (SemanticSpanReplayAuditEdit & { blockId: string })[]
  mappings: readonly GroundedSpan[]
}): void {
  const { sourceParagraphXml, outputParagraphXml, blockId } = input
  const sourceText = extractCanonicalParagraphText(sourceParagraphXml)
  const auditEdits = input.edits.map((edit) => {
    const mapping = input.mappings.find((item) => item.sourceBlockId === blockId
      && item.span.start === edit.span.start && item.span.end === edit.span.end)
    assert.ok(mapping, `${blockId}: every edit has a grounded source span`)
    return { ...edit, span: { ...edit.span, segments: mapping.span.segments } }
  })
  assert.equal(
    extractCanonicalParagraphText(outputParagraphXml),
    reconstructSemanticSpanAuditText(sourceText, auditEdits),
    `${blockId}: text outside grounded spans is unchanged`,
  )
  if (auditEdits.length === 0) return

  const sourceSlots = extractSemanticParagraphTextSlots(sourceParagraphXml)
  const outputSlots = extractSemanticParagraphTextSlots(outputParagraphXml)
  assert.equal(outputSlots.length, sourceSlots.length, `${blockId}: structural slots are preserved`)
  assert.equal(
    (outputParagraphXml.match(/<w:br\b/g) ?? []).length,
    (sourceParagraphXml.match(/<w:br\b/g) ?? []).length,
    `${blockId}: required breaks are preserved`,
  )
  const breakOffsets = semanticParagraphBreakOffsets(sourceParagraphXml)
  for (const edit of auditEdits) {
    if (!edit.replacementSegments) continue
    assert.ok(edit.span.segments && edit.span.segments.length === edit.replacementSegments.length,
      `${blockId}: replacement segments match grounded slots`)
    edit.replacementSegments.forEach((segment, index) => {
      const segmentStart = edit.span.segments![index]!.start
      const slotIndex = breakOffsets.filter((offset) => offset <= segmentStart).length
      assert.ok(outputSlots[slotIndex]?.includes(segment), `${blockId}: segment ${index + 1} remains in its source slot`)
    })
  }
}

/** Apply in-place extras locally, then add paragraphs without rewriting grounded OOXML. */
export async function continueSemanticReplayDocx(input: {
  semanticBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  semanticBlocks: TransformedBlock[]
  extraBlocks: TransformedBlock[]
  paragraphInsertions: ContractParagraphInsertion[]
  groundedEditBlockIds: readonly string[]
}): Promise<ArrayBuffer> {
  const semanticById = new Map(input.semanticBlocks.map((block) => [block.blockId, block.text]))
  const changedExtras = input.extraBlocks.filter((block) => block.text !== semanticById.get(block.blockId))
  const groundedIds = new Set(input.groundedEditBlockIds)
  for (const block of changedExtras) {
    assert.ok(semanticById.has(block.blockId), `Unknown extras target: ${block.blockId}`)
    assert.equal(groundedIds.has(block.blockId), false, `Extras target overlaps a grounded edit: ${block.blockId}`)
  }

  let bytes = input.semanticBytes
  if (changedExtras.length > 0) {
    const postSemanticBlocks = await indexDocxForTransform(bytes)
    bytes = await writeTransformedDocx({
      sourceBytes: bytes,
      sourceBlocks: postSemanticBlocks,
      transformedBlocks: changedExtras,
    })
  }
  return writeTransformedDocx({
    sourceBytes: bytes,
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.extraBlocks,
    paragraphInsertions: input.paragraphInsertions,
    sourceAlreadyContainsGroundedEdits: true,
  })
}

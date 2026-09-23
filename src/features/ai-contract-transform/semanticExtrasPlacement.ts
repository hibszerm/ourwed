import type { TransformDocumentBlock } from './types'

/** The model chooses meaning; this value contains only SOURCE structure. */
export type SemanticExtrasPlacement = {
  sourceBlockId: string
  side: 'before' | 'after'
}

export type ResolvedExtrasBoundary = SemanticExtrasPlacement & {
  mode: 'model' | 'structural_fallback'
  paragraphIndex: number
}

/** Internal structure only. Paragraph indexes refer to source OOXML w:p order. */
export type SemanticExtrasTemplateMetadata = {
  packageDescriptionRegion: { startParagraphIndex: number; endParagraphIndex: number }
  mainContractualBodyRegion: { startParagraphIndex: number; endParagraphIndex: number }
  signatureBoundaryParagraphIndex: number
  fallbackBoundaryParagraphIndex: number
}

function visibleClauseNumber(text: string): number | null {
  const match = text.trimStart().match(/^(\d{1,3})[.)]\s/)
  return match ? Number(match[1]) : null
}

function safeBoundary(blocks: readonly TransformDocumentBlock[], index: number, structuralOnly = false): boolean {
  if (index < 0 || index > blocks.length) return false
  const before = blocks[index - 1]
  const after = blocks[index]
  // A heading and its immediately following table form one structural unit.
  if (before?.kind === 'paragraph' && after?.kind === 'tableCell') return false
  if (before?.kind === 'tableCell' && after?.kind === 'paragraph') return false
  if (before?.kind !== 'paragraph' || after?.kind !== 'paragraph') return true
  if (!structuralOnly) {
    const left = visibleClauseNumber(before.text)
    const right = visibleClauseNumber(after.text)
    if (left !== null && right !== null && right === left + 1) return false
  }
  if (before.numberingKey && before.numberingKey === after.numberingKey) return false
  return true
}

function validate(
  blocks: readonly TransformDocumentBlock[],
  placement: SemanticExtrasPlacement,
  metadata?: SemanticExtrasTemplateMetadata,
): ResolvedExtrasBoundary | null {
  if (!placement || (placement.side !== 'before' && placement.side !== 'after')) return null
  const matches = blocks.flatMap((block, index) => block.blockId === placement.sourceBlockId ? [index] : [])
  if (matches.length !== 1) return null
  const anchor = blocks[matches[0]!]!
  if (anchor.kind !== 'paragraph') return null
  const boundaryIndex = matches[0]! + (placement.side === 'after' ? 1 : 0)
  const paragraphBoundary = anchor.paragraphIndex + (placement.side === 'after' ? 1 : 0)
  if (metadata) {
    const { packageDescriptionRegion, mainContractualBodyRegion, signatureBoundaryParagraphIndex } = metadata
    const firstAdmissible = Math.max(packageDescriptionRegion.endParagraphIndex + 1, mainContractualBodyRegion.startParagraphIndex)
    const lastAdmissible = Math.min(mainContractualBodyRegion.endParagraphIndex + 1, signatureBoundaryParagraphIndex)
    if (paragraphBoundary < firstAdmissible || paragraphBoundary > lastAdmissible || paragraphBoundary > signatureBoundaryParagraphIndex) return null
    if (anchor.paragraphIndex < mainContractualBodyRegion.startParagraphIndex || anchor.paragraphIndex > mainContractualBodyRegion.endParagraphIndex) return null
  }
  const boundary = boundaryIndex
  if (!safeBoundary(blocks, boundary, Boolean(metadata))) return null
  return { ...placement, mode: 'model', paragraphIndex: anchor.paragraphIndex }
}

/** Purely physical fallback. It neither reads words nor infers contract meaning. */
export function resolveSemanticExtrasPlacement(
  blocks: readonly TransformDocumentBlock[],
  requested?: SemanticExtrasPlacement | null,
  metadata?: SemanticExtrasTemplateMetadata,
): ResolvedExtrasBoundary {
  if (metadata) {
    const model = requested && validate(blocks, requested, metadata)
    if (model) return model
    const before = blocks.find((block) => block.kind === 'paragraph' && block.paragraphIndex === metadata.fallbackBoundaryParagraphIndex)
    const after = blocks.find((block) => block.kind === 'paragraph' && block.paragraphIndex + 1 === metadata.fallbackBoundaryParagraphIndex)
    const fallback = [
      ...(before ? [{ sourceBlockId: before.blockId, side: 'before' as const }] : []),
      ...(after ? [{ sourceBlockId: after.blockId, side: 'after' as const }] : []),
    ].map((candidate) => validate(blocks, candidate, metadata)).find((candidate) => candidate !== null) ?? null
    if (!fallback) throw new Error('ADDITIONAL_SERVICES_SAFE_PLACEMENT_NOT_FOUND')
    return { ...fallback, mode: 'structural_fallback' }
  }
  const model = requested && validate(blocks, requested)
  if (model) return model
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index]!
    if (block.kind !== 'paragraph' || !block.text.trim()) continue
    const fallback = validate(blocks, { sourceBlockId: block.blockId, side: 'after' })
    if (fallback) return { ...fallback, mode: 'structural_fallback' }
  }
  throw new Error('ADDITIONAL_SERVICES_SAFE_PLACEMENT_NOT_FOUND')
}

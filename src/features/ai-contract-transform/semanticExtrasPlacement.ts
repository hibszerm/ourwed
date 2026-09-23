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

function visibleClauseNumber(text: string): number | null {
  const match = text.trimStart().match(/^(\d{1,3})[.)]\s/)
  return match ? Number(match[1]) : null
}

function safeBoundary(blocks: readonly TransformDocumentBlock[], index: number): boolean {
  if (index < 0 || index > blocks.length) return false
  const before = blocks[index - 1]
  const after = blocks[index]
  // A heading and its immediately following table form one structural unit.
  if (before?.kind === 'paragraph' && after?.kind === 'tableCell') return false
  if (before?.kind === 'tableCell' && after?.kind === 'paragraph') return false
  if (before?.kind !== 'paragraph' || after?.kind !== 'paragraph') return true
  const left = visibleClauseNumber(before.text)
  const right = visibleClauseNumber(after.text)
  if (left !== null && right !== null && right === left + 1) return false
  if (before.numberingKey && before.numberingKey === after.numberingKey) return false
  return true
}

function validate(
  blocks: readonly TransformDocumentBlock[],
  placement: SemanticExtrasPlacement,
): ResolvedExtrasBoundary | null {
  if (!placement || (placement.side !== 'before' && placement.side !== 'after')) return null
  const matches = blocks.flatMap((block, index) => block.blockId === placement.sourceBlockId ? [index] : [])
  if (matches.length !== 1) return null
  const anchor = blocks[matches[0]!]!
  if (anchor.kind !== 'paragraph') return null
  const boundary = matches[0]! + (placement.side === 'after' ? 1 : 0)
  if (!safeBoundary(blocks, boundary)) return null
  return { ...placement, mode: 'model', paragraphIndex: anchor.paragraphIndex }
}

/** Purely physical fallback. It neither reads words nor infers contract meaning. */
export function resolveSemanticExtrasPlacement(
  blocks: readonly TransformDocumentBlock[],
  requested?: SemanticExtrasPlacement | null,
): ResolvedExtrasBoundary {
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

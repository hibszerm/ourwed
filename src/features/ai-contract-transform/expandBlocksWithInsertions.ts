/**
 * Expand transformed blocks with virtually inserted paragraphs for verification.
 */

import type { TransformDocumentBlock, TransformedBlock } from './types'

export type ContractParagraphInsertion = {
  afterParagraphIndex: number
  /** Set for a direct insertion before a SOURCE body paragraph. */
  beforeParagraphIndex?: number
  paragraphs: string[]
  /**
   * CG7: when inserting new paragraphs after a numbered anchor, detach
   * Word list numbering (numPr) so extras do not continue outer clause numbers.
   * Default for additional-services path: 'detach'.
   */
  listNumbering?: 'detach' | 'inherit'
  presentation?: 'plain' | 'inherit'
}

export function expandBlocksWithParagraphInsertions(input: {
  sourceBlocks: TransformDocumentBlock[]
  blocks: TransformedBlock[]
  insertions: ContractParagraphInsertion[]
}): TransformedBlock[] {
  if (input.insertions.length === 0) return input.blocks

  const byId = new Map(input.blocks.map((b) => [b.blockId, b.text]))
  const insertionsByAfter = new Map<number, string[]>()
  const insertionsByBefore = new Map<number, string[]>()
  for (const ins of input.insertions) {
    const target = ins.beforeParagraphIndex === undefined ? insertionsByAfter : insertionsByBefore
    const key = ins.beforeParagraphIndex ?? ins.afterParagraphIndex
    const existing = target.get(key) ?? []
    target.set(key, [
      ...existing,
      ...ins.paragraphs,
    ])
  }

  const result: TransformedBlock[] = []
  for (const src of input.sourceBlocks) {
    for (const [i, text] of (insertionsByBefore.get(src.paragraphIndex) ?? []).entries()) {
      result.push({ blockId: `inserted-before-${src.paragraphIndex}-${i}`, text })
    }
    result.push({
      blockId: src.blockId,
      text: byId.get(src.blockId) ?? src.text,
    })
    const inserted = insertionsByAfter.get(src.paragraphIndex)
    if (!inserted) continue
    for (let i = 0; i < inserted.length; i++) {
      result.push({
        blockId: `inserted-after-${src.paragraphIndex}-${i}`,
        text: inserted[i]!,
      })
    }
  }
  return result
}

/**
 * Expand transformed blocks with virtually inserted paragraphs for verification.
 */

import type { TransformDocumentBlock, TransformedBlock } from './types'

export type ContractParagraphInsertion = {
  afterParagraphIndex: number
  paragraphs: string[]
}

export function expandBlocksWithParagraphInsertions(input: {
  sourceBlocks: TransformDocumentBlock[]
  blocks: TransformedBlock[]
  insertions: ContractParagraphInsertion[]
}): TransformedBlock[] {
  if (input.insertions.length === 0) return input.blocks

  const byId = new Map(input.blocks.map((b) => [b.blockId, b.text]))
  const insertionsByAfter = new Map<number, string[]>()
  for (const ins of input.insertions) {
    const existing = insertionsByAfter.get(ins.afterParagraphIndex) ?? []
    insertionsByAfter.set(ins.afterParagraphIndex, [
      ...existing,
      ...ins.paragraphs,
    ])
  }

  const result: TransformedBlock[] = []
  for (const src of input.sourceBlocks) {
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

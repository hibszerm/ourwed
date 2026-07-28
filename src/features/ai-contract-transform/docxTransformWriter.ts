/**
 * Write transformed block texts back into the original DOCX.
 * Preserves structure via production applyDocxParagraphEdits.
 */

import { applyDocxParagraphEditsAndInsertions } from '@/features/documents/template/docxParagraphEditor'
import type { TransformDocumentBlock, TransformedBlock } from './types'
import type { ContractParagraphInsertion } from './expandBlocksWithInsertions'

export async function writeTransformedDocx(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  paragraphInsertions?: ContractParagraphInsertion[]
}): Promise<ArrayBuffer> {
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))
  const edits = input.sourceBlocks
    .map((src) => {
      const next = byId.get(src.blockId)
      if (next === undefined || next === src.text) return null
      return {
        index: src.paragraphIndex,
        text: next,
      }
    })
    .filter((e): e is { index: number; text: string } => e != null)

  const insertions = (input.paragraphInsertions ?? []).map((ins) => ({
    afterIndex: ins.afterParagraphIndex,
    paragraphs: ins.paragraphs,
  }))

  return applyDocxParagraphEditsAndInsertions(
    input.sourceBytes,
    edits,
    insertions,
  )
}

export function downloadFileName(originalName: string, mode: 'full-ai' | 'guarded-ai'): string {
  const base = originalName.replace(/\.docx$/i, '') || 'umowa'
  return `${base}-${mode}.docx`
}

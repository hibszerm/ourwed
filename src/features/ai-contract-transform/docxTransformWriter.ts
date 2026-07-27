/**
 * Write transformed block texts back into the original DOCX.
 * Preserves structure via production applyDocxParagraphEdits.
 */

import { applyDocxParagraphEdits } from '@/features/documents/template/docxParagraphEditor'
import type { TransformDocumentBlock, TransformedBlock } from './types'

export async function writeTransformedDocx(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
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

  return applyDocxParagraphEdits(input.sourceBytes, edits)
}

export function downloadFileName(originalName: string, mode: 'full-ai' | 'guarded-ai'): string {
  const base = originalName.replace(/\.docx$/i, '') || 'umowa'
  return `${base}-${mode}.docx`
}

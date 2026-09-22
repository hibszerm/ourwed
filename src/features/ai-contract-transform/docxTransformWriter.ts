/**
 * Write transformed block texts back into the original DOCX.
 * Preserves structure via production applyDocxParagraphEdits.
 */

import { applyDocxParagraphEdits, applyDocxParagraphEditsAndInsertions } from '@/features/documents/template/docxParagraphEditor'
import type { TransformDocumentBlock, TransformedBlock } from './types'
import type { ContractParagraphInsertion } from './expandBlocksWithInsertions'
import type { SemanticMappingExecutionResult } from './semanticMappingExecutor'

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
    listNumbering: ins.listNumbering ?? 'detach',
  }))

  return applyDocxParagraphEditsAndInsertions(
    input.sourceBytes,
    edits,
    insertions,
  )
}

/** Thin offline-capable adapter from executed semantic spans to the existing DOCX span writer. */
export async function writeSemanticMappingDocx(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: readonly TransformDocumentBlock[]
  execution: Extract<SemanticMappingExecutionResult, { ok: true }>
}): Promise<ArrayBuffer> {
  const indexById = new Map(input.sourceBlocks.map((block) => [block.blockId, block.paragraphIndex]))
  const edits = input.execution.spanEdits.map((edit) => {
    const index = indexById.get(edit.blockId)
    if (index === undefined) throw new Error(`Unknown semantic mapping source block: ${edit.blockId}`)
    return { index, text: '', span: { ...edit.span, replacement: edit.replacement } }
  })
  return applyDocxParagraphEdits(input.sourceBytes, edits)
}

export function downloadFileName(originalName: string, mode: 'full-ai' | 'guarded-ai'): string {
  const base = originalName.replace(/\.docx$/i, '') || 'umowa'
  return `${base}-${mode}.docx`
}

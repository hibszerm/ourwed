/**
 * Execute RenderPlan — renderer never computes replacement or reads wedding data.
 */

import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import { applyDocxParagraphEdits } from '@/features/documents/template/docxParagraphEditor'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import type { TemplateSlot } from '@/features/documents/template/types'
import { readyOperations } from './buildRenderPlan'
import type { IndexedDocxBlock, RenderPlan, RenderPlanOperation } from '../types'

function operationToSlot(operation: RenderPlanOperation): TemplateSlot {
  return {
    id: operation.operationId,
    registryKey: operation.operationId,
    label: operation.fieldKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: operation.paragraphIndex,
    startOffset: operation.sourceRange.start,
    endOffset: operation.sourceRange.end,
    originalText: operation.sourceRange.sourceText,
    allowedRange: {
      start: operation.sourceRange.start,
      end: operation.sourceRange.end,
    },
  }
}

export function sortOperationsForRender(
  operations: RenderPlanOperation[],
): RenderPlanOperation[] {
  return [...operations].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex - b.paragraphIndex
    }
    if (a.sourceRange.start !== b.sourceRange.start) {
      return b.sourceRange.start - a.sourceRange.start
    }
    const wordsFirst = (k: string) =>
      k === 'contract_value_words' ? 0 : k === 'contract_value_formatted' ? 1 : 2
    return wordsFirst(a.fieldKey) - wordsFirst(b.fieldKey)
  })
}

export type RenderPlanExecutionResult = {
  outputBytes: ArrayBuffer
  appliedParagraphs: Array<{ index: number; text: string }>
  spanEdits: Array<{
    index: number
    start: number
    end: number
    replacement: string
    registryKey: string
  }>
  replacementTraces: ReturnType<typeof applyBoundSlotsToParagraphs>['replacementTraces']
  rendererOperations: number
  replacedParagraphIndices: number[]
  executedOperationIds: string[]
}

export async function executeRenderPlan(input: {
  plan: RenderPlan
  sourceBytes: ArrayBuffer
  blocks: IndexedDocxBlock[]
}): Promise<RenderPlanExecutionResult> {
  const operations = sortOperationsForRender(readyOperations(input.plan))

  for (const op of operations) {
    if (!op.replacementText.trim()) {
      throw new Error(
        `RenderPlan operation ${op.operationId} has empty replacementText`,
      )
    }
  }

  const slots = operations.map(operationToSlot)
  const resolved: Record<string, string> = {}
  for (const op of operations) {
    resolved[op.operationId] = op.replacementText
  }

  const extracted = await extractDocxParagraphsIncludingEmpty(input.sourceBytes)
  const original = extracted.map((p) => ({ index: p.index, text: p.text }))

  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
    omittedKeys: [],
  })

  if (applied.failures.length > 0) {
    const detail = applied.failures
      .map((f) => `${f.registryKey}: ${f.reason}`)
      .join('; ')
    throw new Error(`Renderowanie nie powiodło się: ${detail}`)
  }

  const spanEdits = [...applied.spanEdits].sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return b.start - a.start
  })

  const outputBytes = await applyDocxParagraphEdits(
    input.sourceBytes,
    spanEdits.map((e) => ({
      index: e.index,
      text: '',
      span: {
        start: e.start,
        end: e.end,
        replacement: e.replacement,
      },
    })),
  )

  const replacedParagraphIndices = [
    ...new Set(applied.replacementTraces.map((t) => t.paragraphIndex)),
  ]

  return {
    outputBytes,
    appliedParagraphs: applied.paragraphs,
    spanEdits,
    replacementTraces: applied.replacementTraces,
    rendererOperations: applied.applied.filter((a) => !a.omitted).length,
    replacedParagraphIndices,
    executedOperationIds: operations.map((op) => op.operationId),
  }
}

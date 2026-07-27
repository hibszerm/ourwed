/**
 * Experiment-only DOCX renderer — reuses production applyBoundSlots + docxParagraphEditor.
 */

import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import { applyDocxParagraphEdits } from '@/features/documents/template/docxParagraphEditor'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import type { TemplateSlot } from '@/features/documents/template/types'
import { buildResolvedValuesFromBindings } from './replacementValueFormatting'
import type { ExperimentalPhysicalBinding, IndexedDocxBlock } from './types'

function bindingToSlot(binding: ExperimentalPhysicalBinding): TemplateSlot {
  return {
    id: binding.id,
    registryKey: binding.id,
    label: binding.fieldKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: binding.paragraphIndex,
    startOffset: binding.start,
    endOffset: binding.end,
    originalText: binding.sourceText,
    allowedRange: { start: binding.start, end: binding.end },
  }
}

/** Money pair in same paragraph must apply words before numeric (right-to-left). */
export function sortBindingsForRender(
  bindings: ExperimentalPhysicalBinding[],
): ExperimentalPhysicalBinding[] {
  return [...bindings].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex - b.paragraphIndex
    }
    if (a.start !== b.start) return b.start - a.start
    const wordsFirst = (k: string) =>
      k === 'contract_value_words' ? 0 : k === 'contract_value_formatted' ? 1 : 2
    return wordsFirst(a.fieldKey) - wordsFirst(b.fieldKey)
  })
}

export type ExperimentalRenderResult = {
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
}

export async function renderExperimentalDocx(input: {
  sourceBytes: ArrayBuffer
  blocks: IndexedDocxBlock[]
  bindings: ExperimentalPhysicalBinding[]
}): Promise<ExperimentalRenderResult> {
  const sortedBindings = sortBindingsForRender(input.bindings)
  const slots = sortedBindings.map(bindingToSlot)
  const resolved = buildResolvedValuesFromBindings(sortedBindings)

  const extracted = await extractDocxParagraphsIncludingEmpty(input.sourceBytes)
  const original = extracted.map((p) => ({ index: p.index, text: p.text }))

  const applied = applyBoundSlotsToParagraphs({
    original,
    slots,
    resolved,
    omittedKeys: [],
  })

  if (applied.failures.length > 0) {
    const detail = applied.failures.map((f) => `${f.registryKey}: ${f.reason}`).join('; ')
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
  }
}

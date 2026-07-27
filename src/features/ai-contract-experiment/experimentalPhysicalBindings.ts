/**
 * Temporary physical bindings for experiment rendering only.
 */

import { findBlockById } from './indexedDocx'
import { formatReplacementValueForOccurrence } from './replacementValueFormatting'
import { validateSpanProviderExclusion } from './providerExclusion'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  ExperimentalPhysicalBinding,
  IndexedDocxBlock,
  ValidatedAiMapping,
} from './types'

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

export function buildExperimentalPhysicalBindings(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  blocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
}): ExperimentalPhysicalBinding[] {
  const approved = input.mappings.filter(
    (m) =>
      m.validationStatus === 'valid' &&
      (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
  )

  return approved
    .map((m) => {
      const replacementValue = formatReplacementValueForOccurrence({
        mapping: m,
        generationInput: input.generationInput,
      })
      if (!replacementValue.trim()) return null
      return {
        id: m.id ?? `exp-bind-${m.fieldKey}-${m.paragraphIndex}-${m.start}`,
        experimentRunId: input.experimentRunId,
        fieldKey: m.fieldKey,
        blockId: m.blockId,
        paragraphIndex: m.paragraphIndex,
        tableIndex: m.tableIndex,
        rowIndex: m.rowIndex,
        cellIndex: m.cellIndex,
        start: m.start,
        end: m.end,
        sourceText: m.resolvedExactValue || m.sourceText,
        replacementValue,
        origin:
          m.resolutionMethod === 'manual'
            ? 'manual'
            : m.resolutionMethod === 'refined_by_validator'
              ? 'refined_by_validator'
              : 'ai_exact',
      } satisfies ExperimentalPhysicalBinding
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
}

export function verifyBindingsBeforeRender(input: {
  bindings: ExperimentalPhysicalBinding[]
  blocks: IndexedDocxBlock[]
}): { ok: true } | { ok: false; reason: string } {
  const { bindings, blocks } = input

  for (const b of bindings) {
    const block = findBlockById(blocks, b.blockId)
    if (!block) return { ok: false, reason: `stale_block:${b.fieldKey}` }
    const slice = block.text.slice(b.start, b.end)
    if (slice !== b.sourceText) {
      return { ok: false, reason: `stale_source_text:${b.fieldKey}` }
    }
    const exclusion = validateSpanProviderExclusion({
      fieldKey: b.fieldKey,
      block,
      exactValue: b.sourceText,
      start: b.start,
      end: b.end,
    })
    if (!exclusion.ok) {
      return { ok: false, reason: exclusion.reason }
    }
  }

  const byParagraph = new Map<number, ExperimentalPhysicalBinding[]>()
  for (const b of bindings) {
    const list = byParagraph.get(b.paragraphIndex) ?? []
    list.push(b)
    byParagraph.set(b.paragraphIndex, list)
  }

  for (const [, group] of byParagraph) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (rangesOverlap(group[i]!, group[j]!)) {
          return { ok: false, reason: 'binding_overlap' }
        }
      }
    }
  }

  const numeric = bindings.find((b) => b.fieldKey === 'contract_value_formatted')
  const words = bindings.find((b) => b.fieldKey === 'contract_value_words')
  if (numeric && words && numeric.replacementValue && words.replacementValue) {
    if (numeric.blockId === words.blockId && rangesOverlap(numeric, words)) {
      return { ok: false, reason: 'money_pair_overlap' }
    }
  }

  return { ok: true }
}

export function bindingsForField(
  bindings: ExperimentalPhysicalBinding[],
  fieldKey: ContractFieldKey,
): ExperimentalPhysicalBinding[] {
  return bindings.filter((b) => b.fieldKey === fieldKey)
}

/**
 * Post-render replacement trace audit — authoritative per-binding checks.
 */

import type { SlotReplacementTrace } from '@/features/documents/template/applyBoundSlots'
import type {
  ExperimentalPhysicalBinding,
  ExperimentalReplacementCheck,
} from './types'

export function auditReplacementTraces(input: {
  bindings: ExperimentalPhysicalBinding[]
  traces: SlotReplacementTrace[]
  resultingParagraphs: Array<{ index: number; text: string }>
}): ExperimentalReplacementCheck[] {
  const paraByIndex = new Map(
    input.resultingParagraphs.map((p) => [p.index, p.text]),
  )

  return input.bindings.map((binding) => {
    const trace = input.traces.find(
      (t) =>
        t.bindingId === binding.id ||
        t.key === binding.id ||
        (t.key === binding.fieldKey &&
          t.paragraphIndex === binding.paragraphIndex &&
          t.originalValue === binding.sourceText),
    )

    const resultingParagraphText = paraByIndex.get(binding.paragraphIndex) ?? ''
    const sourceTextMatchedBeforeReplace = trace
      ? trace.originalValue === binding.sourceText
      : false
    const replacementApplied = Boolean(
      trace &&
        trace.replacementValue === binding.replacementValue &&
        resultingParagraphText.includes(binding.replacementValue),
    )

    return {
      fieldKey: binding.fieldKey,
      paragraphIndex: binding.paragraphIndex,
      expectedSourceText: binding.sourceText,
      expectedReplacementText: binding.replacementValue,
      sourceStart: binding.start,
      sourceEnd: binding.end,
      replacementApplied,
      sourceTextMatchedBeforeReplace,
      resultingParagraphText,
      traceFound: Boolean(trace),
    }
  })
}

export function summarizeReplacementAudit(
  checks: ExperimentalReplacementCheck[],
): {
  allApplied: boolean
  skippedBindings: string[]
  issues: string[]
} {
  const skippedBindings: string[] = []
  const issues: string[] = []

  for (const c of checks) {
    if (!c.replacementApplied) {
      skippedBindings.push(c.fieldKey)
      issues.push(`${c.fieldKey}: replacement not applied at paragraph ${c.paragraphIndex}`)
    }
    if (!c.sourceTextMatchedBeforeReplace) {
      issues.push(`${c.fieldKey}: source text mismatch before replace`)
    }
    const slice = c.resultingParagraphText.slice(c.sourceStart, c.sourceEnd)
    if (slice.includes(c.expectedSourceText) && slice !== c.expectedReplacementText) {
      issues.push(`${c.fieldKey}: original source value still present in bound range`)
    }
  }

  return {
    allApplied: skippedBindings.length === 0 && issues.length === 0,
    skippedBindings,
    issues,
  }
}

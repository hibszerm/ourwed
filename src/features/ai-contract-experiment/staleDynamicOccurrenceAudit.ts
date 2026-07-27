/**
 * Post-render stale dynamic occurrence audit.
 */

import type {
  ContractFieldKey,
  ExperimentalPhysicalBinding,
  IndexedDocxBlock,
  ValidatedAiMapping,
} from './types'
import { isOccurrenceResolved } from './occurrenceResolution'

export type StaleDynamicOccurrenceIssue = {
  code: 'stale_dynamic_occurrence'
  severity: 'critical'
  fieldKey: ContractFieldKey
  blockId: string
  sourceText: string
  message: string
}

function boundSpanKeys(bindings: ExperimentalPhysicalBinding[]): Set<string> {
  return new Set(bindings.map((b) => `${b.blockId}:${b.start}:${b.end}`))
}

export function auditStaleDynamicOccurrences(input: {
  sourceBlocks: IndexedDocxBlock[]
  outputParagraphs: Array<{ index: number; text: string }>
  mappings: ValidatedAiMapping[]
  bindings: ExperimentalPhysicalBinding[]
}): StaleDynamicOccurrenceIssue[] {
  const outputByIndex = new Map(
    input.outputParagraphs.map((p) => [p.index, p.text]),
  )
  const bound = boundSpanKeys(input.bindings)
  const issues: StaleDynamicOccurrenceIssue[] = []

  const candidates = input.mappings.filter((m) => {
    if (m.validationStatus === 'rejected') return false
    if (m.approvalStatus === 'ignored_immutable') return false
    if (m.approvalStatus === 'rejected_by_user') return false
    const sourceText = m.resolvedExactValue || m.sourceText
    return Boolean(sourceText.trim())
  })

  for (const m of candidates) {
    const sourceText = m.resolvedExactValue || m.sourceText
    const block = input.sourceBlocks.find((b) => b.id === m.blockId)
    if (!block) continue

    const outputText = outputByIndex.get(block.paragraphIndex)
    if (outputText === undefined) continue

    const spanKey = `${m.blockId}:${m.start}:${m.end}`
    const wasBound = bound.has(spanKey)
    const resolved = isOccurrenceResolved(m)

    if (resolved && wasBound) {
      if (outputText.includes(sourceText)) {
        issues.push({
          code: 'stale_dynamic_occurrence',
          severity: 'critical',
          fieldKey: m.fieldKey,
          blockId: m.blockId,
          sourceText,
          message: `Niezastąpiona wartość dynamiczna „${sourceText}” w ${m.blockId}.`,
        })
      }
      continue
    }

    if (!resolved && outputText.includes(sourceText)) {
      issues.push({
        code: 'stale_dynamic_occurrence',
        severity: 'critical',
        fieldKey: m.fieldKey,
        blockId: m.blockId,
        sourceText,
        message: `Nierozwiązane wystąpienie „${sourceText}” pozostało w ${m.blockId}.`,
      })
    }
  }

  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.blockId}:${issue.sourceText}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

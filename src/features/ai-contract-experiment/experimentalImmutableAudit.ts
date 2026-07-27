/**
 * Immutable region audit — compare source vs output outside approved binding spans.
 */

import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import type { SlotReplacementTrace } from '@/features/documents/template/applyBoundSlots'
import type {
  ExperimentalImmutableCheck,
  ExperimentalPhysicalBinding,
  ExperimentalRenderAudit,
  ExperimentalReplacementCheck,
  IndexedDocxBlock,
} from './types'

const IMMUTABLE_SNIPPETS = [
  NOWICCY_FIXTURE.provider,
  NOWICCY_FIXTURE.nip,
  NOWICCY_FIXTURE.regon,
  NOWICCY_FIXTURE.bankAccount,
  NOWICCY_FIXTURE.deliveryPeriod,
  NOWICCY_FIXTURE.cancellationClause,
  'teaser 60',
  'film główny',
] as const

function bindingRangesForParagraph(
  bindings: ExperimentalPhysicalBinding[],
  paragraphIndex: number,
): Array<{ start: number; end: number }> {
  return bindings
    .filter((b) => b.paragraphIndex === paragraphIndex)
    .map((b) => ({ start: b.start, end: b.end }))
    .sort((a, b) => a.start - b.start)
}

function textOutsideRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>,
): string {
  if (ranges.length === 0) return text
  let out = ''
  let cursor = 0
  for (const r of ranges) {
    out += text.slice(cursor, r.start)
    cursor = r.end
  }
  out += text.slice(cursor)
  return out
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function auditExperimentalImmutable(input: {
  sourceBlocks: IndexedDocxBlock[]
  outputParagraphs: Array<{ index: number; text: string }>
  bindings: ExperimentalPhysicalBinding[]
  replacementTraces?: SlotReplacementTrace[]
  replacementChecks?: ExperimentalReplacementCheck[]
  replacementChecksIssues?: string[]
}): ExperimentalRenderAudit {
  const immutableChecks: ExperimentalImmutableCheck[] = []
  const issues: ExperimentalRenderAudit['issues'] = []

  const outputByIndex = new Map(
    input.outputParagraphs.map((p) => [p.index, p.text]),
  )

  let blocksChecked = 0

  const outputRangesByParagraph = new Map<
    number,
    Array<{ start: number; end: number }>
  >()
  for (const trace of input.replacementTraces ?? []) {
    const list = outputRangesByParagraph.get(trace.paragraphIndex) ?? []
    list.push({ start: trace.generatedStart, end: trace.generatedEnd })
    outputRangesByParagraph.set(trace.paragraphIndex, list)
  }

  for (const block of input.sourceBlocks) {
    const outputText = outputByIndex.get(block.paragraphIndex)
    if (outputText === undefined) {
      issues.push({
        severity: 'critical',
        code: 'missing_paragraph',
        message: `Brak akapitu ${block.paragraphIndex} w wyniku renderowania.`,
        paragraphIndex: block.paragraphIndex,
      })
      continue
    }

    blocksChecked++
    const sourceRanges = bindingRangesForParagraph(input.bindings, block.paragraphIndex)
    const outputRanges =
      outputRangesByParagraph.get(block.paragraphIndex) ??
      sourceRanges
    const sourceOutside = textOutsideRanges(block.text, sourceRanges)
    const outputOutside = textOutsideRanges(outputText, outputRanges)

    const sourceNorm = normalizeForCompare(sourceOutside)
    const outputNorm = normalizeForCompare(outputOutside)
    const unchanged = sourceNorm === outputNorm

    immutableChecks.push({
      paragraphIndex: block.paragraphIndex,
      blockId: block.id,
      sourceOutsideText: sourceOutside,
      outputOutsideText: outputOutside,
      unchanged,
    })

    if (!unchanged) {
      const isFormattingOnly =
        sourceNorm.replace(/\s/g, '') === outputNorm.replace(/\s/g, '')
      issues.push({
        severity: isFormattingOnly ? 'warning' : 'critical',
        code: 'immutable_region_changed',
        message: `Zmiana poza zatwierdzonymi zakresami w akapicie ${block.paragraphIndex}.`,
        paragraphIndex: block.paragraphIndex,
      })
    }
  }

  const fullOutput = input.outputParagraphs.map((p) => p.text).join('\n')
  for (const snippet of IMMUTABLE_SNIPPETS) {
    const inSource = input.sourceBlocks.some((b) => b.text.includes(snippet))
    if (!inSource) continue
    if (!fullOutput.includes(snippet)) {
      issues.push({
        severity: 'critical',
        code: 'immutable_fact_missing',
        message: `Brak oczekiwanej niezmiennej treści: „${snippet}”.`,
      })
    }
  }

  for (const issue of input.replacementChecksIssues ?? []) {
    issues.push({
      severity: 'critical',
      code: 'replacement_trace_failed',
      message: issue,
    })
  }

  const hasCritical = issues.some((i) => i.severity === 'critical')
  const hasWarning = issues.some((i) => i.severity === 'warning')

  return {
    status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'safe',
    immutableChecks,
    issues,
    immutableBlocksChecked: blocksChecked,
  }
}

export function mergeRenderAudit(input: {
  replacementChecks: ReturnType<
    typeof import('./experimentalReplacementTraceAudit').auditReplacementTraces
  >
  immutableAudit: ExperimentalRenderAudit
  staleIssues?: Array<{
    code: string
    severity: 'critical' | 'warning'
    message: string
    fieldKey?: string
    blockId?: string
  }>
}): ExperimentalRenderAudit {
  const traceSummary = input.replacementChecks.every((c) => c.replacementApplied)
  if (traceSummary && input.immutableAudit.status !== 'critical') {
    return input.immutableAudit
  }
  const extraIssues = input.replacementChecks
    .filter((c) => !c.replacementApplied)
    .map((c) => ({
      severity: 'critical' as const,
      code: 'replacement_not_applied',
      message: `Nie zastosowano zamiany dla ${c.fieldKey}.`,
      paragraphIndex: c.paragraphIndex,
    }))

  const staleIssues =
    input.staleIssues?.map((i) => ({
      severity: i.severity,
      code: i.code,
      message: i.message,
      fieldKey: i.fieldKey,
      blockId: i.blockId,
    })) ?? []

  const allIssues = [...input.immutableAudit.issues, ...extraIssues, ...staleIssues]
  const hasCritical = allIssues.some((i) => i.severity === 'critical')
  const hasWarning = allIssues.some((i) => i.severity === 'warning')

  return {
    ...input.immutableAudit,
    replacementChecks: input.replacementChecks,
    status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'safe',
    issues: allIssues,
  }
}

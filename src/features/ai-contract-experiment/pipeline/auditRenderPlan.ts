/**
 * Audit compares RenderPlan vs actual DOCX modifications.
 */

import type { SlotReplacementTrace } from '@/features/documents/template/applyBoundSlots'
import { auditExperimentalImmutable } from '../experimentalImmutableAudit'
import { readyOperations } from './buildRenderPlan'
import type {
  ExperimentalRenderAudit,
  IndexedDocxBlock,
  RenderPlan,
  RenderPlanOperation,
} from '../types'

export type RenderPlanAuditInput = {
  plan: RenderPlan
  sourceBlocks: IndexedDocxBlock[]
  outputParagraphs: Array<{ index: number; text: string }>
  replacementTraces: SlotReplacementTrace[]
}

function findOutputParagraph(
  paragraphs: Array<{ index: number; text: string }>,
  paragraphIndex: number,
): string {
  return paragraphs.find((p) => p.index === paragraphIndex)?.text ?? ''
}

function operationWasExecuted(
  operation: RenderPlanOperation,
  traces: SlotReplacementTrace[],
  outputParagraphs: Array<{ index: number; text: string }>,
): boolean {
  const trace = traces.find((t) => t.bindingId === operation.operationId)
  if (trace) {
    return trace.replacementValue === operation.replacementText
  }
  const output = findOutputParagraph(outputParagraphs, operation.paragraphIndex)
  return !output.includes(operation.sourceRange.sourceText)
}

export function auditRenderPlan(input: RenderPlanAuditInput): ExperimentalRenderAudit {
  const issues: ExperimentalRenderAudit['issues'] = []
  const ready = readyOperations(input.plan)

  for (const operation of ready) {
    const executed = operationWasExecuted(
      operation,
      input.replacementTraces,
      input.outputParagraphs,
    )
    if (!executed) {
      issues.push({
        severity: 'critical',
        code: 'render_plan_operation_skipped',
        message: `Operacja renderowania nie została wykonana: ${operation.fieldKey}`,
        paragraphIndex: operation.paragraphIndex,
        blockId: operation.blockId,
      })
    }
  }

  for (const operation of input.plan.operations) {
    if (operation.status !== 'BLOCKED') continue
    if (operation.strategy === 'CUSTOM_TEXT_REQUIRED') {
      const output = findOutputParagraph(
        input.outputParagraphs,
        operation.paragraphIndex,
      )
      if (output.includes(operation.sourceRange.sourceText)) {
        issues.push({
          severity: 'critical',
          code: 'stale_dynamic_occurrence',
          message: 'Nierozwiązane wystąpienie pola dynamicznego pozostało w dokumencie.',
          paragraphIndex: operation.paragraphIndex,
          blockId: operation.blockId,
        })
      }
    }
  }

  const immutableBindings = ready.map((op) => ({
    id: op.operationId,
    experimentRunId: input.plan.experimentRunId,
    fieldKey: op.fieldKey,
    blockId: op.blockId,
    paragraphIndex: op.paragraphIndex,
    start: op.sourceRange.start,
    end: op.sourceRange.end,
    sourceText: op.sourceRange.sourceText,
    replacementValue: op.replacementText,
    origin: 'ai_exact' as const,
  }))

  const replacementChecks = ready.map((op) => {
    const executed = operationWasExecuted(
      op,
      input.replacementTraces,
      input.outputParagraphs,
    )
    return {
      fieldKey: op.fieldKey,
      paragraphIndex: op.paragraphIndex,
      expectedSourceText: op.sourceRange.sourceText,
      expectedReplacementText: op.replacementText,
      sourceStart: op.sourceRange.start,
      sourceEnd: op.sourceRange.end,
      replacementApplied: executed,
      sourceTextMatchedBeforeReplace: true,
      resultingParagraphText: findOutputParagraph(
        input.outputParagraphs,
        op.paragraphIndex,
      ),
      traceFound: input.replacementTraces.some(
        (t) => t.bindingId === op.operationId,
      ),
    }
  })

  const immutableAudit = auditExperimentalImmutable({
    sourceBlocks: input.sourceBlocks,
    outputParagraphs: input.outputParagraphs,
    bindings: immutableBindings,
    replacementTraces: input.replacementTraces,
    replacementChecks,
    replacementChecksIssues: issues.map((i) => i.message),
  })

  const allIssues = [...issues, ...immutableAudit.issues]
  const status: ExperimentalRenderAudit['status'] = allIssues.some(
    (i) => i.severity === 'critical',
  )
    ? 'critical'
    : allIssues.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'safe'

  return {
    status,
    replacementChecks,
    immutableChecks: immutableAudit.immutableChecks,
    immutableBlocksChecked: immutableAudit.immutableBlocksChecked,
    issues: allIssues,
  }
}

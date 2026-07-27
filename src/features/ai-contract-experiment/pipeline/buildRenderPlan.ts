/**
 * Build RenderPlan from ContractOccurrenceGraph — sole source for renderer input.
 */

import { resolvedReplacementText } from './replacementStrategy'
import type {
  ContractOccurrence,
  ContractOccurrenceGraph,
  RenderOperationStatus,
  RenderPlan,
  RenderPlanOperation,
  ReplacementStrategy,
} from '../types'

function operationStatus(occurrence: ContractOccurrence): RenderOperationStatus {
  if (occurrence.replacementStrategy === 'IGNORE_OCCURRENCE') {
    return 'SKIPPED'
  }
  if (occurrence.validationStatus === 'rejected') {
    return 'SKIPPED'
  }
  if (occurrence.approvalStatus === 'rejected_by_user') {
    return 'SKIPPED'
  }
  if (
    occurrence.approvalStatus !== 'approved' &&
    occurrence.approvalStatus !== 'manually_mapped'
  ) {
    return 'BLOCKED'
  }
  const replacementText = resolvedReplacementText(occurrence)
  if (!replacementText.trim()) {
    return 'BLOCKED'
  }
  return 'READY'
}

function occurrenceToOperation(occurrence: ContractOccurrence): RenderPlanOperation {
  const replacementText = resolvedReplacementText(occurrence)
  const status = operationStatus(occurrence)
  return {
    operationId: `op:${occurrence.id}`,
    occurrenceId: occurrence.id,
    fieldKey: occurrence.fieldKey,
    blockId: occurrence.blockId,
    paragraphIndex: occurrence.paragraphIndex,
    tableIndex: occurrence.physicalRange.tableIndex,
    rowIndex: occurrence.physicalRange.rowIndex,
    cellIndex: occurrence.physicalRange.cellIndex,
    sourceRange: {
      start: occurrence.physicalRange.start,
      end: occurrence.physicalRange.end,
      sourceText: occurrence.sourceValue,
    },
    replacementText: status === 'READY' ? replacementText : '',
    strategy: occurrence.replacementStrategy,
    status,
  }
}

export function buildRenderPlan(graph: ContractOccurrenceGraph): RenderPlan {
  const operations = graph.occurrences
    .filter((o) => o.validationStatus !== 'rejected')
    .map(occurrenceToOperation)

  return {
    experimentRunId: graph.experimentRunId,
    operations,
  }
}

export function readyOperations(plan: RenderPlan): RenderPlanOperation[] {
  return plan.operations.filter((op) => op.status === 'READY')
}

export function blockedOperations(plan: RenderPlan): RenderPlanOperation[] {
  return plan.operations.filter((op) => op.status === 'BLOCKED')
}

export function isPlanExecutable(plan: RenderPlan): boolean {
  const actionable = plan.operations.filter((op) => op.status !== 'SKIPPED')
  if (actionable.length === 0) return false
  return actionable.every((op) => op.status === 'READY')
}

export function strategiesRequiringApproval(
  strategy: ReplacementStrategy,
): boolean {
  return strategy !== 'IGNORE_OCCURRENCE'
}

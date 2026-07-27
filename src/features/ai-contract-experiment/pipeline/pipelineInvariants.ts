/**
 * DEV pipeline invariants — impossible states throw immediately.
 */

import { buildRenderPlan, isPlanExecutable } from './buildRenderPlan'
import { evaluateGraphReadiness } from './planReadiness'
import { assertOccurrenceUiConsistency } from '../validation/occurrenceDisplayStatus'
import { resolvedReplacementText } from './replacementStrategy'
import { selectPipelineCounts } from './pipelineSelectors'
import type {
  ContractOccurrenceGraph,
  ExperimentComparisonMetrics,
  MappingReadinessStatus,
  RenderPlan,
} from '../types'

function devEnabled(): boolean {
  return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
}

export function assertPipelineInvariants(input: {
  graph: ContractOccurrenceGraph
  plan?: RenderPlan
  readiness?: MappingReadinessStatus
  metrics?: ExperimentMetricsSubset
}): void {
  if (!devEnabled()) return

  const plan = input.plan ?? buildRenderPlan(input.graph)
  const readiness = input.readiness ?? evaluateGraphReadiness(input.graph)

  for (const occurrence of input.graph.occurrences) {
    assertOccurrenceUiConsistency(occurrence, occurrence.id)
    if (occurrence.approvalStatus === 'approved') {
      if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
        if (!occurrence.customReplacement?.trim()) {
          throw new Error(
            `[pipeline-invariant] approved CUSTOM_TEXT_REQUIRED without customReplacement: ${occurrence.id}`,
          )
        }
      } else if (occurrence.replacementStrategy !== 'IGNORE_OCCURRENCE') {
        const text = resolvedReplacementText(occurrence)
        if (!text.trim()) {
          throw new Error(
            `[pipeline-invariant] approved occurrence without replacement: ${occurrence.id}`,
          )
        }
      }
    }

    if (
      readiness === 'ready' &&
      occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED' &&
      occurrence.approvalStatus === 'pending'
    ) {
      throw new Error(
        `[pipeline-invariant] READY with unresolved custom text: ${occurrence.id}`,
      )
    }
  }

  if (readiness === 'ready' && !isPlanExecutable(plan)) {
    throw new Error('[pipeline-invariant] READY but RenderPlan not executable')
  }

  if (input.metrics) {
    const counts = selectPipelineCounts(input.graph, plan)
    if (
      input.metrics.plannedRendererOperations !== undefined &&
      input.metrics.plannedRendererOperations !== counts.plannedRendererOperations
    ) {
      throw new Error('[pipeline-invariant] metrics.plannedRendererOperations !== RenderPlan')
    }
    if (
      input.metrics.approvedMappings !== undefined &&
      input.metrics.approvedMappings !==
        input.graph.occurrences.filter(
          (o) =>
            o.approvalStatus === 'approved' || o.approvalStatus === 'manually_mapped',
        ).length
    ) {
      throw new Error('[pipeline-invariant] metrics.approvedMappings mismatch')
    }
  }

  for (const operation of plan.operations) {
    if (operation.status === 'READY' && !operation.replacementText.trim()) {
      throw new Error(
        `[pipeline-invariant] READY operation without replacementText: ${operation.operationId}`,
      )
    }
  }
}

type ExperimentMetricsSubset = Pick<
  ExperimentComparisonMetrics,
  'approvedMappings' | 'plannedRendererOperations'
>

export function assertAuditMatchesPlan(input: {
  plan: RenderPlan
  auditStatus: 'safe' | 'warning' | 'critical'
  skippedOperationIds: string[]
}): void {
  if (!devEnabled()) return
  const ready = input.plan.operations.filter((op) => op.status === 'READY')
  if (input.auditStatus === 'safe') {
    for (const op of ready) {
      if (input.skippedOperationIds.includes(op.operationId)) {
        throw new Error(
          `[pipeline-invariant] audit safe with skipped operation: ${op.operationId}`,
        )
      }
    }
  }
}

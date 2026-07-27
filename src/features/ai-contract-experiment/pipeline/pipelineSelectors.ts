/**
 * Derived selectors — metrics, eligibility, counts from graph + plan only.
 */

import { buildRenderPlan, readyOperations } from './buildRenderPlan'
import { evaluateGraphReadiness } from './planReadiness'
import { occurrenceIsApproved } from './graphReviewActions'
import type {
  ContractOccurrenceGraph,
  ExperimentComparisonMetrics,
  ExperimentRunResult,
  MappingReadinessStatus,
  RenderPlan,
} from '../types'
import type { ExperimentalRenderEligibility } from '../experimentalRenderEligibility'

export function selectRenderPlan(graph: ContractOccurrenceGraph): RenderPlan {
  return buildRenderPlan(graph)
}

export function selectReadiness(graph: ContractOccurrenceGraph): MappingReadinessStatus {
  return evaluateGraphReadiness(graph)
}

export function selectRenderEligibility(input: {
  graph: ContractOccurrenceGraph
  sourceDocxAvailable: boolean
}): ExperimentalRenderEligibility {
  const readiness = selectReadiness(input.graph)
  const plan = selectRenderPlan(input.graph)
  const reasons: ExperimentalRenderEligibility['reasons'] = []

  if (!input.sourceDocxAvailable) {
    reasons.push('source_docx_missing')
  }
  if (readiness !== 'ready') {
    reasons.push('mapping_not_ready')
  }

  const numeric = plan.operations.find(
    (op) => op.fieldKey === 'contract_value_formatted' && op.status === 'READY',
  )
  const words = plan.operations.find(
    (op) => op.fieldKey === 'contract_value_words' && op.status === 'READY',
  )
  if (numeric && !words) {
    reasons.push('incomplete_pair')
  }
  if (words && !numeric) {
    reasons.push('incomplete_pair')
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  }
}

export function selectPipelineCounts(graph: ContractOccurrenceGraph, plan: RenderPlan) {
  const occurrences = graph.occurrences
  return {
    total: occurrences.length,
    valid: occurrences.filter((o) => o.validationStatus === 'valid').length,
    pending: occurrences.filter((o) => o.approvalStatus === 'pending').length,
    approved: occurrences.filter((o) => o.approvalStatus === 'approved').length,
    rejectedByUser: occurrences.filter((o) => o.approvalStatus === 'rejected_by_user')
      .length,
    manuallyMapped: occurrences.filter((o) => o.approvalStatus === 'manually_mapped')
      .length,
    ignored: occurrences.filter((o) => o.approvalStatus === 'ignored_immutable').length,
    plannedRendererOperations: readyOperations(plan).length,
  }
}

export function selectPipelineMetrics(input: {
  result: ExperimentRunResult
  graph: ContractOccurrenceGraph
  plan: RenderPlan
  auditStatus?: string
  rendererOperations?: number
}): ExperimentComparisonMetrics {
  const counts = selectPipelineCounts(input.graph, input.plan)
  const approvedOccurrences = input.graph.occurrences.filter(occurrenceIsApproved)

  return {
    ...input.result.metrics,
    approvedMappings: approvedOccurrences.length,
    plannedRendererOperations: counts.plannedRendererOperations,
    rendererOperations: input.rendererOperations ?? input.result.metrics.rendererOperations ?? 0,
    validMappings: counts.valid,
    pendingMappings: counts.pending,
    rejectedMappings: counts.rejectedByUser,
    manualMappings: counts.manuallyMapped,
    auditStatus: input.auditStatus ?? selectReadiness(input.graph),
    generationSuccess: selectReadiness(input.graph) !== 'invalid',
  }
}

export function groupOccurrencesByField(graph: ContractOccurrenceGraph) {
  const byField = new Map<string, ContractOccurrenceGraph['occurrences']>()
  for (const occurrence of graph.occurrences) {
    const list = byField.get(occurrence.fieldKey) ?? []
    list.push(occurrence)
    byField.set(occurrence.fieldKey, list)
  }
  return [...byField.entries()].map(([fieldKey, occurrences]) => ({
    fieldKey,
    occurrences: occurrences.sort((a, b) => {
      if (a.blockId !== b.blockId) return a.blockId.localeCompare(b.blockId)
      return a.physicalRange.start - b.physicalRange.start
    }),
  }))
}

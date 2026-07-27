/**
 * Canonical pipeline state reducer — graph is the only mutable mapping state.
 */

import { saveExperimentRun } from '../experimentStorage'
import { assertPipelineInvariants } from './pipelineInvariants'
import {
  buildOccurrenceGraphFromMappings,
  refreshOccurrenceGraph,
} from './buildOccurrenceGraph'
import { buildRenderPlan } from './buildRenderPlan'
import { evaluateGraphReadiness } from './planReadiness'
import {
  selectPipelineMetrics,
  selectRenderEligibility,
  selectRenderPlan,
} from './pipelineSelectors'
import { graphToValidatedMappings } from './graphAdapters'
import type { ContractOccurrenceGraph, ExperimentRunResult } from '../types'

export function ensureOccurrenceGraph(result: ExperimentRunResult): ContractOccurrenceGraph {
  if (result.occurrenceGraph) {
    return refreshOccurrenceGraph({
      graph: result.occurrenceGraph,
      blocks: result.indexedBlocks,
      generationInput: result.generationInput,
    })
  }
  if (!result.validatedMappings?.length) {
    return {
      experimentRunId: result.run.id,
      occurrences: [],
    }
  }
  return buildOccurrenceGraphFromMappings({
    experimentRunId: result.run.id,
    mappings: result.validatedMappings,
    blocks: result.indexedBlocks,
    generationInput: result.generationInput,
    supplement: true,
  })
}

export function recomputePipelineResult(
  result: ExperimentRunResult,
  graph: ContractOccurrenceGraph,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  const plan = selectRenderPlan(graph)
  const readiness = evaluateGraphReadiness(graph)
  const renderEligibility = selectRenderEligibility({
    graph,
    sourceDocxAvailable: options?.sourceDocxAvailable ?? true,
  })

  const executedRendererOps =
    result.mappingPhase === 'rendered'
      ? (result.metrics.rendererOperations ?? readyCount(plan))
      : 0

  const metrics = selectPipelineMetrics({
    result,
    graph,
    plan,
    auditStatus: result.renderAudit?.status ?? readiness,
    rendererOperations: executedRendererOps,
  })

  const updated: ExperimentRunResult = {
    ...result,
    occurrenceGraph: graph,
    validatedMappings: graphToValidatedMappings(graph),
    renderPlan: plan,
    mappingReadiness: readiness,
    metrics,
    renderEligibility,
  }

  assertPipelineInvariants({
    graph,
    plan,
    readiness,
    metrics,
  })

  return updated
}

function readyCount(plan: ReturnType<typeof buildRenderPlan>): number {
  return plan.operations.filter((op) => op.status === 'READY').length
}

export function applyGraphUpdate(
  result: ExperimentRunResult,
  graph: ContractOccurrenceGraph,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  const updated = recomputePipelineResult(result, graph, options)
  saveExperimentRun(updated.run, updated)
  return updated
}

export function initializePipelineResult(
  result: ExperimentRunResult,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  const graph = ensureOccurrenceGraph(result)
  return recomputePipelineResult(result, graph, options)
}

/** @deprecated Use applyGraphUpdate — kept for tests migrating from validatedMappings. */
export function applyReviewMappingsUpdateFromMappings(
  result: ExperimentRunResult,
  mappings: NonNullable<ExperimentRunResult['validatedMappings']>,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  const graph = buildOccurrenceGraphFromMappings({
    experimentRunId: result.run.id,
    mappings,
    blocks: result.indexedBlocks,
    generationInput: result.generationInput,
    supplement: true,
  })
  return applyGraphUpdate(result, graph, options)
}

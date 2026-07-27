/**
 * Single view-model selector for experiment run UI — derives from occurrence graph.
 */

import { classifyMappingWarning } from './mappingWarningSeverity'
import { ensureOccurrenceGraph } from './pipeline/pipelineState'
import {
  selectPipelineCounts,
  selectPipelineMetrics,
  selectReadiness,
  selectRenderEligibility,
  selectRenderPlan,
} from './pipeline/pipelineSelectors'
import { graphToValidatedMappings } from './pipeline/graphAdapters'
import type {
  ExperimentRunResult,
  MappingReadinessStatus,
  StructuredAiMappingResponse,
} from './types'
import type { ExperimentalRenderEligibility } from './experimentalRenderEligibility'

export type ExperimentalRunViewModel = {
  run: ExperimentRunResult['run']
  graph: NonNullable<ExperimentRunResult['occurrenceGraph']>
  plan: NonNullable<ExperimentRunResult['renderPlan']>
  mappings: NonNullable<ExperimentRunResult['validatedMappings']>
  readiness: MappingReadinessStatus
  metrics: ExperimentRunResult['metrics']
  renderEligibility: ExperimentalRenderEligibility
  warnings: ReturnType<typeof classifyMappingWarning>[]
  counts: ReturnType<typeof selectPipelineCounts> & {
    executedRendererOperations: number
  }
}

export function selectExperimentalRunViewModel(input: {
  result: ExperimentRunResult
  sourceDocxAvailable: boolean
}): ExperimentalRunViewModel | null {
  if (input.result.mode !== 'structured_mapping') {
    return null
  }

  const graph = ensureOccurrenceGraph(input.result)
  const plan = input.result.renderPlan ?? selectRenderPlan(graph)
  const mappings = graphToValidatedMappings(graph)
  const readiness = input.result.mappingReadiness ?? selectReadiness(graph)
  const renderEligibility = selectRenderEligibility({
    graph,
    sourceDocxAvailable: input.sourceDocxAvailable,
  })

  const executedRendererOps =
    input.result.mappingPhase === 'rendered'
      ? (input.result.metrics.rendererOperations ?? 0)
      : 0

  const metrics = selectPipelineMetrics({
    result: input.result,
    graph,
    plan,
    auditStatus: input.result.renderAudit?.status ?? readiness,
    rendererOperations: executedRendererOps,
  })

  const warnings = (input.result.structuredMapping?.warnings ?? []).map(
    classifyMappingWarning,
  )

  return {
    run: input.result.run,
    graph,
    plan,
    mappings,
    readiness,
    metrics,
    renderEligibility,
    warnings,
    counts: {
      ...selectPipelineCounts(graph, plan),
      executedRendererOperations: executedRendererOps,
    },
  }
}

export function informationalWarnings(
  response?: StructuredAiMappingResponse,
): ReturnType<typeof classifyMappingWarning>[] {
  return (response?.warnings ?? [])
    .map(classifyMappingWarning)
    .filter((w) => w.severity === 'info')
}

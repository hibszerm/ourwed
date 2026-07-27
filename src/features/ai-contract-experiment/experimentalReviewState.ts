/**
 * Canonical experiment review state — delegates to pipeline graph reducer.
 */

import { graphToValidatedMappings } from './pipeline/graphAdapters'
import {
  applyGraphUpdate,
  applyReviewMappingsUpdateFromMappings,
  ensureOccurrenceGraph,
  initializePipelineResult,
  recomputePipelineResult,
} from './pipeline/pipelineState'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { replacementPreviewForField } from './replacementPreview'
import { createMappingId } from './mappingId'
import type {
  ContractOccurrenceGraph,
  ExperimentRunResult,
  ReviewedExperimentalMapping,
  ValidatedAiMapping,
} from './types'

export function ensureReviewedMappings(
  mappings: ValidatedAiMapping[],
  experimentRunId: string,
  generationInput?: ExperimentRunResult['generationInput'],
): ReviewedExperimentalMapping[] {
  return mappings.map((m) => {
    const id =
      m.id ??
      createMappingId({
        experimentRunId,
        fieldKey: m.fieldKey,
        blockId: m.blockId,
        start: m.start,
        end: m.end,
      })
    const replacementValue =
      m.targetValue?.trim() ||
      m.replacementValue?.trim() ||
      (generationInput
        ? replacementPreviewForField(m.fieldKey, generationInput)
        : '')
    return {
      ...m,
      id,
      experimentRunId,
      replacementValue,
    }
  })
}

export function recomputeExperimentResult(
  result: ExperimentRunResult,
  mappings: ValidatedAiMapping[],
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  return applyReviewMappingsUpdateFromMappings(result, mappings, options)
}

export function applyReviewMappingsUpdate(
  result: ExperimentRunResult,
  mappings: ValidatedAiMapping[],
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  return applyReviewMappingsUpdateFromMappings(result, mappings, options)
}

export function applyGraphReviewUpdate(
  result: ExperimentRunResult,
  graph: ContractOccurrenceGraph,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  return applyGraphUpdate(result, graph, options)
}

export function initializeReviewedResult(
  result: ExperimentRunResult,
  options?: { sourceDocxAvailable?: boolean },
): ExperimentRunResult {
  if (!result.validatedMappings?.length && !result.occurrenceGraph) return result
  return initializePipelineResult(result, options)
}

export function graphFromResult(result: ExperimentRunResult): ContractOccurrenceGraph {
  return ensureOccurrenceGraph(result)
}

export function mappingsFromGraph(graph: ContractOccurrenceGraph): ValidatedAiMapping[] {
  return graphToValidatedMappings(graph)
}

export function buildGraphFromMappings(
  result: ExperimentRunResult,
  mappings: ValidatedAiMapping[],
): ContractOccurrenceGraph {
  return buildOccurrenceGraphFromMappings({
    experimentRunId: result.run.id,
    mappings,
    blocks: result.indexedBlocks,
    generationInput: result.generationInput,
    supplement: true,
  })
}

export { recomputePipelineResult }

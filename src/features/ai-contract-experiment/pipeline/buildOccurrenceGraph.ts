/**
 * Build canonical ContractOccurrenceGraph from validated AI mappings.
 */

import { findBlockById } from '../indexedDocx'
import { createMappingId } from '../mappingId'
import { supplementOccurrenceMappings } from '../supplementalOccurrenceDetection'
import { getOccurrenceTargetValue } from '../validation/occurrenceAccessors'
import {
  assignReplacementStrategy,
  computeOccurrenceReplacementValue,
} from './replacementStrategy'
import type {
  ContractGenerationInput,
  ContractOccurrence,
  ContractOccurrenceGraph,
  IndexedDocxBlock,
  OccurrenceGraphOrigin,
  ValidatedAiMapping,
} from '../types'

function originFromMapping(m: ValidatedAiMapping): OccurrenceGraphOrigin {
  if (m.occurrenceOrigin === 'validator_detected') return 'validator'
  if (m.resolutionMethod === 'manual') return 'manual'
  if (m.occurrenceOrigin === 'ai_proposal') return 'ai'
  return 'ai'
}

function mappingToOccurrence(input: {
  mapping: ValidatedAiMapping
  experimentRunId: string
  generationInput: ContractGenerationInput
  blocks: IndexedDocxBlock[]
}): ContractOccurrence {
  const { mapping, experimentRunId, blocks } = input
  const block = findBlockById(blocks, mapping.blockId)
  const sourceValue = mapping.resolvedExactValue || mapping.sourceText
  const id =
    mapping.id ??
    createMappingId({
      experimentRunId,
      fieldKey: mapping.fieldKey,
      blockId: mapping.blockId,
      start: mapping.start,
      end: mapping.end,
    })

  const occurrence: ContractOccurrence = {
    id,
    fieldKey: mapping.fieldKey,
    blockId: mapping.blockId,
    paragraphIndex: mapping.paragraphIndex,
    physicalRange: {
      start: mapping.start,
      end: mapping.end,
      tableIndex: mapping.tableIndex,
      rowIndex: mapping.rowIndex,
      cellIndex: mapping.cellIndex,
    },
    sourceValue,
    targetValue: '',
    replacementValue: '',
    customReplacement: mapping.customReplacementValue,
    approvalStatus: mapping.approvalStatus,
    validationStatus: mapping.validationStatus,
    origin: originFromMapping(mapping),
    confidence: mapping.confidence,
    confidenceScore: mapping.confidenceScore,
    pairedFieldGroup: mapping.pairedFieldGroup,
    relatedPrimaryOccurrenceId: mapping.relatedPrimaryMappingId,
    rejectionReason: mapping.rejectionReason,
    grammaticalForm: mapping.grammaticalForm,
    validationDimensions: mapping.validationDimensions,
    diagnostics: {
      evidenceText: mapping.evidenceText,
      resolutionMethod: mapping.resolutionMethod,
      occurrenceReplacementMode: mapping.occurrenceReplacementMode,
      aiProposedFieldKey: mapping.aiProposedFieldKey ?? mapping.fieldKey,
    },
    replacementStrategy: 'AUTO_REPLACE',
  }

  const canonicalTarget =
    getOccurrenceTargetValue(occurrence) ||
    mapping.targetValue?.trim() ||
    computeOccurrenceReplacementValue({
      fieldKey: mapping.fieldKey,
      sourceValue,
      generationInput: input.generationInput,
      block,
      grammaticalForm: mapping.grammaticalForm,
      occurrenceReplacementMode: mapping.occurrenceReplacementMode,
    })
  occurrence.targetValue = canonicalTarget
  occurrence.replacementValue = canonicalTarget

  occurrence.replacementStrategy = assignReplacementStrategy({
    fieldKey: occurrence.fieldKey,
    validationStatus: occurrence.validationStatus,
    approvalStatus: occurrence.approvalStatus,
    occurrenceReplacementMode: mapping.occurrenceReplacementMode,
    replacementValue: canonicalTarget,
    block,
    grammaticalForm: occurrence.grammaticalForm,
    validationDimensions: occurrence.validationDimensions,
  })

  return occurrence
}

export function buildOccurrenceGraphFromMappings(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  blocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
  supplement?: boolean
}): ContractOccurrenceGraph {
  const mappings = input.supplement
    ? supplementOccurrenceMappings({
        mappings: input.mappings,
        blocks: input.blocks,
        generationInput: input.generationInput,
        experimentRunId: input.experimentRunId,
      })
    : input.mappings

  const occurrences = mappings.map((mapping) =>
    mappingToOccurrence({
      mapping,
      experimentRunId: input.experimentRunId,
      generationInput: input.generationInput,
      blocks: input.blocks,
    }),
  )

  return {
    experimentRunId: input.experimentRunId,
    occurrences,
  }
}

export function refreshOccurrenceGraph(input: {
  graph: ContractOccurrenceGraph
  blocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
}): ContractOccurrenceGraph {
  return {
    experimentRunId: input.graph.experimentRunId,
    occurrences: input.graph.occurrences.map((occurrence) => {
      const block = findBlockById(input.blocks, occurrence.blockId)
      const canonicalTarget =
        getOccurrenceTargetValue(occurrence) ||
        computeOccurrenceReplacementValue({
          fieldKey: occurrence.fieldKey,
          sourceValue: occurrence.sourceValue,
          generationInput: input.generationInput,
          block,
          grammaticalForm: occurrence.grammaticalForm,
          occurrenceReplacementMode:
            occurrence.diagnostics?.occurrenceReplacementMode as
              | ValidatedAiMapping['occurrenceReplacementMode']
              | undefined,
        })
      const updated: ContractOccurrence = {
        ...occurrence,
        targetValue: canonicalTarget,
        replacementValue: canonicalTarget,
        replacementStrategy: assignReplacementStrategy({
          fieldKey: occurrence.fieldKey,
          validationStatus: occurrence.validationStatus,
          approvalStatus: occurrence.approvalStatus,
          occurrenceReplacementMode:
            occurrence.diagnostics?.occurrenceReplacementMode as
              | ValidatedAiMapping['occurrenceReplacementMode']
              | undefined,
          replacementValue: canonicalTarget,
          block,
          grammaticalForm: occurrence.grammaticalForm,
          validationDimensions: occurrence.validationDimensions,
        }),
      }
      return updated
    }),
  }
}

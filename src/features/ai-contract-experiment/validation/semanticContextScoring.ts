/**
 * Deterministic semantic context scoring — type-gated, family-scoped, positive-evidence required.
 */

import type { ContractFieldKey } from '../types'
import {
  CONTRACT_FIELD_DEFINITIONS,
  getFieldDefinition,
  type ContractFieldDefinition,
} from './fieldDefinitionRegistry'
import {
  classifyValueShape,
  extractLocalSentence,
  isRelativePaymentRule,
  type ValueShapeResult,
} from './valueShapeClassifier'

export type ContextScoreResult = {
  fieldKey: ContractFieldKey
  score: number
  allowedHits: number
  contradictoryHits: number
}

const MIN_POSITIVE_SCORE = 2
const MIN_WINNING_MARGIN = 2

function scoreFieldAgainstContext(
  def: ContractFieldDefinition,
  context: string,
): ContextScoreResult {
  const lower = context.toLowerCase()
  let allowedHits = 0
  let contradictoryHits = 0
  for (const re of def.allowedContextSignals) {
    if (re.test(lower)) allowedHits += 1
  }
  for (const re of def.contradictoryContextSignals) {
    if (re.test(lower)) contradictoryHits += 1
  }
  const score = allowedHits * 2 - contradictoryHits * 3
  return { fieldKey: def.key, score, allowedHits, contradictoryHits }
}

export function fieldsCompatibleWithShape(
  shape: ValueShapeResult['shape'],
): ContractFieldDefinition[] {
  return CONTRACT_FIELD_DEFINITIONS.filter((def) =>
    def.acceptedValueShapes.includes(shape),
  )
}

export function scoreCompatibleFieldsForContext(
  context: string,
  shape: ValueShapeResult,
): ContextScoreResult[] {
  return fieldsCompatibleWithShape(shape.shape)
    .map((def) => scoreFieldAgainstContext(def, context))
    .sort((a, b) => b.score - a.score)
}

export function scoreAllFieldsForContext(context: string): ContextScoreResult[] {
  return CONTRACT_FIELD_DEFINITIONS.map((def) =>
    scoreFieldAgainstContext(def, context),
  ).sort((a, b) => b.score - a.score)
}

function meetsPositiveEvidence(
  def: ContractFieldDefinition,
  result: ContextScoreResult,
  context: string,
): boolean {
  if (isRelativePaymentRule(context)) {
    return false
  }
  const minHits = def.minPositiveEvidence ?? 0
  if (def.replacementPolicy === 'context_sensitive') {
    return result.allowedHits >= Math.max(1, minHits) && result.contradictoryHits === 0
  }
  return result.allowedHits > 0 || result.score >= MIN_POSITIVE_SCORE
}

export type FieldResolutionResult = {
  fieldKey: ContractFieldKey
  aiProposedFieldKey: ContractFieldKey
  score: number
  proposedScore: number
  valueShape: ValueShapeResult
  reassigned: boolean
}

export function resolveFieldKeyFromContext(input: {
  proposedFieldKey: ContractFieldKey
  blockText: string
  start: number
  end: number
  exactValue: string
}): FieldResolutionResult {
  const context = extractLocalSentence(input.blockText, input.start, input.end)
  const valueShape = classifyValueShape(input.exactValue, context)

  const compatible = scoreCompatibleFieldsForContext(context, valueShape)
  const proposedDef = getFieldDefinition(input.proposedFieldKey)
  const proposedCompatible = proposedDef.acceptedValueShapes.includes(valueShape.shape)

  const proposedResult = compatible.find((s) => s.fieldKey === input.proposedFieldKey)
  const proposedScore = proposedResult?.score ?? -999

  if (!proposedCompatible && compatible.length === 0) {
    return {
      fieldKey: input.proposedFieldKey,
      aiProposedFieldKey: input.proposedFieldKey,
      score: proposedScore,
      proposedScore,
      valueShape,
      reassigned: false,
    }
  }

  const eligible = compatible.filter((s) => {
    const def = getFieldDefinition(s.fieldKey)
    return meetsPositiveEvidence(def, s, context) && s.contradictoryHits === 0
  })

  const best = eligible[0]
  const second = eligible[1]
  const bestScore = best?.score ?? -999
  const secondScore = second?.score ?? -999

  if (
    best &&
    bestScore >= MIN_POSITIVE_SCORE &&
    bestScore - secondScore >= MIN_WINNING_MARGIN
  ) {
    if (proposedCompatible && proposedScore >= bestScore - MIN_WINNING_MARGIN) {
      return {
        fieldKey: input.proposedFieldKey,
        aiProposedFieldKey: input.proposedFieldKey,
        score: proposedScore,
        proposedScore,
        valueShape,
        reassigned: false,
      }
    }
    return {
      fieldKey: best.fieldKey,
      aiProposedFieldKey: input.proposedFieldKey,
      score: bestScore,
      proposedScore,
      valueShape,
      reassigned: best.fieldKey !== input.proposedFieldKey,
    }
  }

  if (proposedCompatible) {
    const def = getFieldDefinition(input.proposedFieldKey)
    const pr = proposedResult ?? scoreFieldAgainstContext(def, context)
    if (
      def.replacementPolicy === 'auto' ||
      meetsPositiveEvidence(def, pr, context)
    ) {
      return {
        fieldKey: input.proposedFieldKey,
        aiProposedFieldKey: input.proposedFieldKey,
        score: proposedScore,
        proposedScore,
        valueShape,
        reassigned: false,
      }
    }
  }

  if (best && best.allowedHits > 0) {
    return {
      fieldKey: best.fieldKey,
      aiProposedFieldKey: input.proposedFieldKey,
      score: bestScore,
      proposedScore,
      valueShape,
      reassigned: best.fieldKey !== input.proposedFieldKey,
    }
  }

  return {
    fieldKey: proposedCompatible ? input.proposedFieldKey : (compatible[0]?.fieldKey ?? input.proposedFieldKey),
    aiProposedFieldKey: input.proposedFieldKey,
    score: proposedScore,
    proposedScore,
    valueShape,
    reassigned: false,
  }
}

export function contextSupportsFieldKey(
  fieldKey: ContractFieldKey,
  blockText: string,
  start: number,
  end: number,
  exactValue: string,
): boolean {
  const context = extractLocalSentence(blockText, start, end)
  const shape = classifyValueShape(exactValue, context)
  const def = getFieldDefinition(fieldKey)
  if (!def.acceptedValueShapes.includes(shape.shape)) return false
  const result = scoreFieldAgainstContext(def, context)
  return meetsPositiveEvidence(def, result, context)
}

export function contextContradictsFieldKey(
  fieldKey: ContractFieldKey,
  blockText: string,
  start: number,
  end: number,
  exactValue: string,
): boolean {
  const context = extractLocalSentence(blockText, start, end)
  const shape = classifyValueShape(exactValue, context)
  const def = getFieldDefinition(fieldKey)
  if (!def.acceptedValueShapes.includes(shape.shape)) return true
  const result = scoreFieldAgainstContext(def, context)
  return result.contradictoryHits > 0 && result.allowedHits === 0
}

export function isShapeCompatibleWithField(
  fieldKey: ContractFieldKey,
  exactValue: string,
): boolean {
  const shape = classifyValueShape(exactValue)
  const def = getFieldDefinition(fieldKey)
  return def.acceptedValueShapes.includes(shape.shape)
}

/**
 * G8 — Flat GoalSpec JSON Schema (OpenAI strict) + parser → GoalSpec.
 * Shared contract shape; Edge mirrors in v5Schema.ts.
 */

import {
  emptyGoalSpec,
  type GoalAggregation,
  type GoalAmbiguity,
  type GoalDialogueOp,
  type GoalMissingSlot,
  type GoalRelationConstraint,
  type GoalRequestKind,
  type GoalSpec,
  type NamedEntityKindHint,
  type PlaceRoleHint,
} from './goalSpec'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'

export const ASSISTANT_V5_GOALSPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'requestKind',
    'dialogue',
    'source',
    'aggregation',
    'measure',
    'temporalExpression',
    'dateDimension',
    'dateDimensionAmbiguous',
    'placeName',
    'placeRole',
    'packageName',
    'extraName',
    'orderByField',
    'orderByDirection',
    'groupByField',
    'aspect0',
    'aspect1',
    'ambiguitySlot0',
    'ambiguityReason0',
    'ambiguitySlot1',
    'ambiguityReason1',
    'inheritActiveCollection',
    'correctionTargetSlot',
    'topicKey',
    'unsupportedReason',
    'namedTargetText',
    'namedTargetKindHint',
  ],
  properties: {
    version: { type: 'number', enum: [1] },
    requestKind: {
      type: 'string',
      description:
        'Request FAMILY only (independent of slot completeness). Incomplete supported CRM queries MUST stay domain_query with unresolved slots/ambiguities. Do NOT use unsupported or clarification to express missing slots. clarification is only for the user answering a prior clarification option. unsupported is only when no supported family can be established.',
      enum: [
        'domain_query',
        'goal_plan',
        'product_help',
        'prepare_action',
        'clarification',
        'unsupported',
      ],
    },
    dialogue: {
      type: 'string',
      enum: ['ask', 'inherit', 'correct', 'clarify_answer'],
    },
    source: {
      type: ['string', 'null'],
      enum: [
        'wedding',
        'participant',
        'venue',
        'package',
        'extra',
        'session',
        'payment',
        'task',
        'contract',
        'unknown',
        null,
      ],
    },
    aggregation: {
      type: ['string', 'null'],
      enum: [
        'count',
        'sum',
        'avg',
        'min',
        'max',
        'list',
        'rank',
        'group',
        null,
      ],
    },
    measure: {
      type: ['string', 'null'],
      enum: [
        'wedding.contract_value',
        'wedding.paid_amount',
        'wedding.remaining_amount',
        null,
      ],
    },
    temporalExpression: { type: ['string', 'null'] },
    dateDimension: {
      type: ['string', 'null'],
      enum: ['wedding.date', null],
    },
    dateDimensionAmbiguous: { type: 'boolean' },
    placeName: { type: ['string', 'null'] },
    placeRole: {
      type: ['string', 'null'],
      enum: ['preparations', 'ceremony', 'reception', null],
    },
    packageName: { type: ['string', 'null'] },
    extraName: { type: ['string', 'null'] },
    orderByField: { type: ['string', 'null'] },
    orderByDirection: {
      type: ['string', 'null'],
      enum: ['asc', 'desc', null],
    },
    groupByField: { type: ['string', 'null'] },
    aspect0: { type: ['string', 'null'] },
    aspect1: { type: ['string', 'null'] },
    ambiguitySlot0: {
      type: ['string', 'null'],
      enum: [
        'measure',
        'date_dimension',
        'entity_kind',
        'source',
        'aggregation',
        'target',
        'other',
        null,
      ],
    },
    ambiguityReason0: { type: ['string', 'null'] },
    ambiguitySlot1: {
      type: ['string', 'null'],
      enum: [
        'measure',
        'date_dimension',
        'entity_kind',
        'source',
        'aggregation',
        'target',
        'other',
        null,
      ],
    },
    ambiguityReason1: { type: ['string', 'null'] },
    inheritActiveCollection: { type: 'boolean' },
    correctionTargetSlot: { type: ['string', 'null'] },
    topicKey: { type: ['string', 'null'] },
    unsupportedReason: { type: ['string', 'null'] },
    namedTargetText: { type: ['string', 'null'] },
    namedTargetKindHint: {
      type: ['string', 'null'],
      enum: [
        'wedding',
        'participant',
        'venue',
        'package',
        'extra',
        'session',
        'payment',
        'task',
        'contract',
        'unknown',
        null,
      ],
    },
  },
} as const

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t.slice(0, 200) : null
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Parse flat model payload into typed GoalSpec.
 * Returns null on schema/structural failure (no repair heuristics).
 */
export function parseFlatGoalSpecPayload(raw: unknown): GoalSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (row.version !== 1) return null

  const requestKind = row.requestKind
  if (
    requestKind !== 'domain_query' &&
    requestKind !== 'goal_plan' &&
    requestKind !== 'product_help' &&
    requestKind !== 'prepare_action' &&
    requestKind !== 'clarification' &&
    requestKind !== 'unsupported'
  ) {
    return null
  }

  const dialogue = row.dialogue
  if (
    dialogue !== 'ask' &&
    dialogue !== 'inherit' &&
    dialogue !== 'correct' &&
    dialogue !== 'clarify_answer'
  ) {
    return null
  }

  const source = (asStringOrNull(row.source) ?? null) as NamedEntityKindHint | null
  const aggregation = (row.aggregation ?? null) as GoalAggregation
  const measure = (row.measure ?? null) as SemanticFieldId | null

  const relations: GoalRelationConstraint[] = []
  const placeName = asStringOrNull(row.placeName)
  const placeRole = row.placeRole as PlaceRoleHint | null
  if (placeName) {
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: {
        text: placeName,
        kindHint: 'venue',
        roleHint: placeRole ?? null,
      },
    })
  }
  if (placeRole && placeRole !== null) {
    relations.push({
      relation: 'place',
      field: 'place.role',
      op: 'eq',
      value: placeRole,
    })
  }
  const packageName = asStringOrNull(row.packageName)
  if (packageName) {
    relations.push({
      relation: 'package',
      field: 'package.name',
      op: 'contains',
      value: { text: packageName, kindHint: 'package' },
    })
  }
  const extraName = asStringOrNull(row.extraName)
  if (extraName) {
    relations.push({
      relation: 'extra',
      field: 'extra.name',
      op: 'contains',
      value: { text: extraName, kindHint: 'extra' },
    })
  }

  const ambiguities: GoalAmbiguity[] = []
  const pushAmb = (slot: unknown, reason: unknown) => {
    if (typeof slot !== 'string' || !slot) return
    ambiguities.push({
      slot: slot as GoalMissingSlot,
      reason: asStringOrNull(reason) ?? 'ambiguous',
    })
  }
  pushAmb(row.ambiguitySlot0, row.ambiguityReason0)
  pushAmb(row.ambiguitySlot1, row.ambiguityReason1)

  const aspects: string[] = []
  const a0 = asStringOrNull(row.aspect0)
  const a1 = asStringOrNull(row.aspect1)
  if (a0) aspects.push(a0)
  if (a1) aspects.push(a1)

  const temporalExpression = asStringOrNull(row.temporalExpression)
  const dateDimensionAmbiguous = asBool(row.dateDimensionAmbiguous, false)
  const dateDimension =
    row.dateDimension === 'wedding.date' ? ('wedding.date' as const) : null

  const temporal =
    temporalExpression || dateDimensionAmbiguous || dateDimension
      ? {
          expression: temporalExpression,
          resolvedRange: null as { from: string; to: string } | null,
          dateDimension,
          dateDimensionAmbiguous,
        }
      : null

  const targets: GoalSpec['targets'] = []
  if (asBool(row.inheritActiveCollection, false)) {
    targets.push({ kind: 'active_collection' })
  }
  const namedText = asStringOrNull(row.namedTargetText)
  if (namedText) {
    targets.push({
      kind: 'named',
      ref: {
        text: namedText,
        kindHint: (asStringOrNull(row.namedTargetKindHint) ??
          'unknown') as NamedEntityKindHint,
      },
    })
  }

  const orderByField = asStringOrNull(row.orderByField)
  const orderByDir = row.orderByDirection
  const orderBy =
    orderByField && (orderByDir === 'asc' || orderByDir === 'desc')
      ? [{ field: orderByField, direction: orderByDir as 'asc' | 'desc' }]
      : []

  const groupByField = asStringOrNull(row.groupByField)
  const groupBy = groupByField ? [groupByField] : []

  const correctionSlot = asStringOrNull(row.correctionTargetSlot)

  return emptyGoalSpec({
    requestKind: requestKind as GoalRequestKind,
    dialogue: dialogue as GoalDialogueOp,
    source,
    aggregation,
    measure,
    temporal,
    relations,
    aspects,
    ambiguities,
    orderBy,
    groupBy,
    targets,
    inheritance: asBool(row.inheritActiveCollection, false)
      ? { fromActiveCollection: true, fromPrevious: dialogue === 'inherit' }
      : null,
    correction: correctionSlot
      ? { targetSlot: correctionSlot, patch: {} }
      : null,
    topicKey: asStringOrNull(row.topicKey),
    unsupportedReason: asStringOrNull(row.unsupportedReason),
  })
}

/** Validate already-typed GoalSpec (post-parse). */
export function validateGoalSpec(goal: GoalSpec): boolean {
  return goal.version === 1 && typeof goal.requestKind === 'string'
}

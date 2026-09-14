/**
 * G6 — GoalSpec V1: future conversational/semantic envelope.
 *
 * GoalSpec = what the user wants (meaning).
 * DomainQuery = one executable representation of a query-shaped goal.
 *
 * Not an intent catalog. Compositional slots only.
 * Shadow / contract foundation — interpreter cutover is later.
 */

import type { SemanticFieldId } from '../domainQuery/fieldRegistry'

export const GOAL_SPEC_VERSION = 1 as const

/** Future execution families — representable now, not all implemented. */
export type GoalRequestKind =
  | 'domain_query'
  | 'goal_plan'
  | 'product_help'
  | 'prepare_action'
  | 'clarification'
  | 'unsupported'

/** Dialogue mechanics (not domain ops). */
export type GoalDialogueOp =
  | 'ask'
  | 'inherit'
  | 'correct'
  | 'clarify_answer'

/**
 * Typed entity kind hints — representation only.
 * No execution required for kinds beyond the current wedding slice.
 */
export type NamedEntityKindHint =
  | 'wedding'
  | 'participant'
  | 'venue'
  | 'package'
  | 'extra'
  | 'session'
  | 'payment'
  | 'task'
  | 'contract'
  | 'unknown'

export type PlaceRoleHint = 'preparations' | 'ceremony' | 'reception'

/**
 * Typed named reference — replaces overloaded titleHint carriers.
 * `text` is a surface form from structured semantics, not a free-form dump.
 */
export type NamedEntityRef = {
  text: string
  kindHint?: NamedEntityKindHint | null
  roleHint?: PlaceRoleHint | null
}

export type GoalEntityRef =
  | { kind: 'named'; ref: NamedEntityRef }
  | { kind: 'active_resource' }
  | { kind: 'active_collection' }
  | { kind: 'active_participant' }
  | { kind: 'bound'; entityKind: NamedEntityKindHint; id: string }

/**
 * Temporal meaning without premature domain binding.
 * Expression may exist without a dateDimension.
 */
export type GoalTemporal = {
  /** Natural temporal expression when known from structured input. */
  expression: string | null
  /** Resolved local calendar range when already bound. */
  resolvedRange: { from: string; to: string } | null
  /**
   * Date dimension when known (e.g. wedding.date).
   * null + dateDimensionAmbiguous → binder must clarify.
   */
  dateDimension: SemanticFieldId | null
  dateDimensionAmbiguous: boolean
}

export type GoalAggregation =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'list'
  | 'rank'
  | 'group'
  | null

export type GoalRelationOp =
  | 'eq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'exists'
  | 'not_exists'

/**
 * Compositional relation/filter constraint.
 * Extensible via relation + field — not per-question root fields.
 */
export type GoalRelationConstraint = {
  relation: 'place' | 'package' | 'extra' | 'payment' | 'contract' | 'unknown'
  /** Semantic field id when known; free string reserved for future registry ids. */
  field: SemanticFieldId | string | null
  op: GoalRelationOp
  value: string | number | boolean | NamedEntityRef | null
  /** When entity kind is ambiguous (e.g. package vs extra). */
  ambiguousKinds?: NamedEntityKindHint[]
}

export type GoalMissingSlot =
  | 'measure'
  | 'date_dimension'
  | 'entity_kind'
  | 'source'
  | 'aggregation'
  | 'target'
  | 'other'

/** First-class ambiguity — do not guess. */
export type GoalAmbiguity = {
  slot: GoalMissingSlot
  reason: string
  candidates?: Array<{ id: string; label: string }>
}

export type GoalOrderBy = {
  field: SemanticFieldId | string
  direction: 'asc' | 'desc'
}

export type GoalSpec = {
  version: typeof GOAL_SPEC_VERSION
  requestKind: GoalRequestKind
  dialogue: GoalDialogueOp
  /** Primary collection/source entity for domain_query. */
  source: NamedEntityKindHint | null
  targets: GoalEntityRef[]
  temporal: GoalTemporal | null
  measure: SemanticFieldId | null
  aggregation: GoalAggregation
  orderBy: GoalOrderBy[]
  groupBy: Array<SemanticFieldId | string>
  /**
   * Top-N / result-cardinality bound when the utterance asks for a bounded ranked set.
   * Meaning-only — IC1 DomainQuery may not execute arbitrary limits.
   */
  limit: number | null
  relations: GoalRelationConstraint[]
  /** Requested aspects/fields without enum explosion. */
  aspects: string[]
  ambiguities: GoalAmbiguity[]
  correction: {
    targetSlot: string
    patch: Record<string, unknown>
  } | null
  inheritance: {
    fromActiveCollection: boolean
    fromPrevious: boolean
  } | null
  /**
   * Opaque structured topic for product_help / prepare_action / goal_plan.
   * Not raw utterance. Not an intent enum catalog.
   */
  topicKey: string | null
  unsupportedReason: string | null
}

export function emptyGoalSpec(partial?: Partial<GoalSpec>): GoalSpec {
  return {
    version: GOAL_SPEC_VERSION,
    requestKind: 'domain_query',
    dialogue: 'ask',
    source: null,
    targets: [],
    temporal: null,
    measure: null,
    aggregation: null,
    orderBy: [],
    groupBy: [],
    limit: null,
    relations: [],
    aspects: [],
    ambiguities: [],
    correction: null,
    inheritance: null,
    topicKey: null,
    unsupportedReason: null,
    ...partial,
  }
}

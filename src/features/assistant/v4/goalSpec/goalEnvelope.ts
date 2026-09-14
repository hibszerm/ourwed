/**
 * S4A — Internal GoalEnvelope foundation (shadow / migration seam).
 *
 * Legacy GoalSpec remains the Luna production contract.
 * GoalEnvelope makes QueryGoal vs non-query families explicit.
 *
 * Clarification is NOT a goal family — it is a Resolver outcome.
 * Incomplete QueryGoal (missing slots) is still QueryGoal.
 */

import type { DomainQuerySource } from '../domainQuery/domainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type {
  GoalAggregation,
  GoalDialogueOp,
  GoalEntityRef,
  GoalRelationConstraint,
  GoalTemporal,
  NamedEntityKindHint,
} from './goalSpec'

/** Minimal slot status for S4A QueryGoal proof. */
export type SlotState<T> =
  | { status: 'resolved'; value: T }
  | { status: 'missing' }
  | { status: 'ambiguous'; candidates?: readonly T[] }

/**
 * Structurally a CRM read/query request — even when slots are incomplete.
 * Missing measure ≠ Unsupported.
 */
export type QueryGoal = {
  kind: 'query'
  source: SlotState<DomainQuerySource | NamedEntityKindHint>
  aggregation: SlotState<Exclude<GoalAggregation, null>>
  measure: SlotState<SemanticFieldId>
  /** Carried through; not redesigned in S4A. */
  temporal: GoalTemporal | null
  relations: GoalRelationConstraint[]
  orderBy: GoalSpecOrderByCarry[]
  groupBy: (SemanticFieldId | string)[]
  targets: GoalEntityRef[]
  dialogue: GoalDialogueOp
  inheritance: { fromActiveCollection: boolean; fromPrevious: boolean } | null
  correction: { targetSlot: string; patch: Record<string, unknown> } | null
}

/** Opaque carry — matches GoalSpec.orderBy shape without importing cycles. */
export type GoalSpecOrderByCarry = {
  field: SemanticFieldId | string
  direction: 'asc' | 'desc'
}

/**
 * Non-query families — placeholders only in S4A.
 * `legacy_clarification_kind` documents requestKind='clarification' migration debt.
 */
export type NonQueryGoal = {
  kind:
    | 'unsupported'
    | 'prepare_action'
    | 'product_help'
    | 'goal_plan'
    | 'legacy_clarification_kind'
  /** Opaque topic / diagnostic — not used for routing. */
  topicKey: string | null
}

export type GoalEnvelope = QueryGoal | NonQueryGoal

export function isQueryGoal(e: GoalEnvelope): e is QueryGoal {
  return e.kind === 'query'
}

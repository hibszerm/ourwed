/**
 * V6-F1.4 — TurnPlan types (operations only — NOT GoalSpec).
 * No top-level year/place/money slots. Values live inside typed step args.
 */

import type {
  AggregateAction,
  RestoreAction,
  SearchAction,
  V6FilterOp,
} from '../semantics/types'
import type { V6Observation } from '../observations/adapt'
import type { ConceptKey, RelationKey } from '../registry'

export const V6_TURN_PLAN_MAX_STEPS = 6

import type { V6WeddingPlaceDetailSelector } from '../detail/weddingPlaceDetail'

export type V6TurnPlanStepKind =
  | 'SEARCH_COLLECTION'
  | 'TRANSFORM_COLLECTION'
  | 'AGGREGATE_COLLECTION'
  | 'RESTORE_COLLECTION'
  | 'INSPECT_WEDDING'
  | 'INSPECT_RESOURCE'
  | 'LIST_RELATED'

export type V6TurnPlanOutputKind =
  | 'COLLECTION'
  | 'AGGREGATE'
  | 'DETAIL'
  | 'CLARIFICATION'
  | 'UNSUPPORTED'

export type V6TurnPlanStep =
  | {
      id: string
      kind: 'SEARCH_COLLECTION'
      search: SearchAction
    }
  | {
      id: string
      kind: 'TRANSFORM_COLLECTION'
      inputFromStep: string | null
      inputHandle: string | null
      ops: V6FilterOp[]
    }
  | {
      id: string
      kind: 'AGGREGATE_COLLECTION'
      inputFromStep: string | null
      inputHandle: string | null
      aggregation: 'count' | 'sum'
      measure: string | null
    }
  | {
      id: string
      kind: 'RESTORE_COLLECTION'
      inputHandle: string
    }
  | {
      id: string
      kind: 'INSPECT_WEDDING'
      inputFromStep: string | null
      inputHandle: string | null
      detailSelector: V6WeddingPlaceDetailSelector
    }
  | {
      id: string
      kind: 'INSPECT_RESOURCE'
      inputFromStep: string | null
      inputHandle: string | null
      concepts: ConceptKey[]
    }
  | {
      id: string
      kind: 'LIST_RELATED'
      inputFromStep: string | null
      inputHandle: string | null
      relation: RelationKey
      limit: number | null
    }

export type V6TurnPlanOutput =
  | {
      kind: 'COLLECTION'
      fromStep: string
    }
  | {
      kind: 'AGGREGATE'
      fromStep: string
    }
  | {
      kind: 'DETAIL'
      fromStep: string
    }
  | {
      kind: 'CLARIFICATION'
      reason: string
      slot: string
    }
  | {
      kind: 'UNSUPPORTED'
      reason: string
    }

export type V6TurnPlan = {
  steps: V6TurnPlanStep[]
  output: V6TurnPlanOutput
}

export type V6PlannedOpClass =
  | 'Search'
  | 'Temporal'
  | 'Filter'
  | 'Exclude'
  | 'Sort'
  | 'Slice'
  | 'Aggregate'
  | 'Restore'
  | 'Inspect'
  | 'ListRelated'

export type V6ExecutedStepRecord = {
  stepId: string
  kind: V6TurnPlanStepKind
  ok: boolean
  code?: string
  detail?: string
  outputHandle?: string
  observation?: V6Observation
  /** Synthetic tool-trace args for judges (same shape as native tools). */
  toolName:
    | 'query_collection'
    | 'transform_collection'
    | 'aggregate_collection'
    | 'restore_collection'
    | 'inspect_wedding'
    | 'inspect_resource'
    | 'list_related'
  toolArgs: Record<string, unknown>
}

export type V6PlanExecutionResult = {
  plan: V6TurnPlan
  executed: V6ExecutedStepRecord[]
  stepHandleById: Record<string, string>
  aggregateByStepId: Record<string, V6Observation>
  completeness: V6PlanCompletenessResult
}

export type V6PlanCompletenessResult =
  | {
      ok: true
      authorizingObservation: V6Observation | null
    }
  | {
      ok: false
      code: 'PLAN_INCOMPLETE' | 'MISSING_AGGREGATE_OBSERVATION' | 'MISSING_COLLECTION_OBSERVATION'
      detail: string
      missingStepIds: string[]
    }

export type AggregateActionForPlan = AggregateAction
export type RestoreActionForPlan = RestoreAction

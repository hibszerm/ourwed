/**
 * V6-F1 — Typed SemanticAction discriminated union.
 * Compositional operators only — no phrase intents, no nullable GoalSpec bag.
 */

export const V6_SEMANTIC_ACTION_VERSION = 1 as const

export type V6CollectionSource = 'wedding'

export type V6MoneyMeasure =
  | 'contract_value'
  | 'paid_amount'
  | 'remaining_amount'

export type V6Aggregation = 'count' | 'sum'

export type V6SortField = 'wedding.date' | V6MoneyMeasure

export type V6Sort = {
  field: V6SortField
  direction: 'asc' | 'desc'
}

export type V6Slice = {
  offset?: number
  limit: number
}

/** Application resolves anchors — Luna never invents NOW as ISO. */
export type V6TemporalAnchor =
  | { kind: 'now' }
  | { kind: 'absolute'; date: string } // YYYY-MM-DD
  | { kind: 'calendar_year'; year: number }
  | { kind: 'calendar_month'; year: number; month: number } // 1-12

export type V6RelativeTemporal =
  | {
      kind: 'future_from_now'
      inclusive: boolean
    }
  | {
      kind: 'past_until_now'
      inclusive: boolean
    }
  | {
      kind: 'closed_range'
      from: V6TemporalAnchor
      to: V6TemporalAnchor
    }
  | {
      kind: 'closed_calendar_year'
      year: number
    }
  | {
      kind: 'closed_calendar_month'
      year: number
      month: number
    }

export type V6PlaceFilter = {
  field: 'place.name'
  op: 'contains' | 'eq'
  value: string
  role?: 'preparations' | 'ceremony' | 'reception' | 'any'
}

export type V6FilterOp =
  | { op: 'Filter'; place: V6PlaceFilter }
  | { op: 'RelativeTemporal'; temporal: V6RelativeTemporal }
  | { op: 'Sort'; sort: V6Sort }
  | { op: 'Slice'; slice: V6Slice }
  | {
      op: 'Exclude'
      by: 'ordinal' | 'place_contains'
      /** 1-based ordinal into current ordered snapshot. */
      ordinal?: number
      placeValue?: string
      placeRole?: 'preparations' | 'ceremony' | 'reception' | 'any'
    }

export type SearchAction = {
  type: 'Search'
  source: V6CollectionSource
  filters?: V6PlaceFilter[]
  excludePlace?: V6PlaceFilter
  relativeTemporal?: V6RelativeTemporal | null
  sort?: V6Sort | null
  slice?: V6Slice | null
}

export type RefineAction = {
  type: 'Refine'
  collection: string
  ops: V6FilterOp[]
}

export type TransformAction = {
  type: 'Transform'
  collection: string
  ops: V6FilterOp[]
}

export type AggregateAction = {
  type: 'Aggregate'
  collection: string
  aggregation: V6Aggregation
  measure?: V6MoneyMeasure | null
}

export type RestoreAction = {
  type: 'Restore'
  collection: string
}

export type ClarifyAction = {
  type: 'Clarify'
  slot: string
  reason: string
  candidates?: Array<{ id: string; label: string }>
}

export type UnsupportedAction = {
  type: 'Unsupported'
  reason: string
}

/** Schema placeholder only — disabled in F1. */
export type PrepareActionPlaceholder = {
  type: 'PrepareAction'
  disabled: true
  reason: 'writes_not_enabled_in_f1'
}

export type SemanticAction =
  | SearchAction
  | RefineAction
  | TransformAction
  | AggregateAction
  | RestoreAction
  | ClarifyAction
  | UnsupportedAction
  | PrepareActionPlaceholder

export type CollectionSemanticDefinition = {
  source: V6CollectionSource
  filters: V6PlaceFilter[]
  excludePlaces: V6PlaceFilter[]
  relativeTemporal: V6RelativeTemporal | null
  sort: V6Sort | null
  slice: V6Slice | null
  /** Ops applied after parent snapshot constrain (for lineage). */
  transformOps: V6FilterOp[]
}

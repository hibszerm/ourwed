/**
 * V6-F1.3 — Operation-class fidelity declaration (NOT GoalSpec).
 * Tracks required OPERATION families only — no year/place/money slots.
 */

export type V6RequestedOperations = {
  needsCollectionSearch: boolean
  needsRefinement: boolean
  needsSort: boolean
  needsSlice: boolean
  needsExclude: boolean
  needsAggregate: 'none' | 'count' | 'sum'
  needsGroup: boolean
  needsRank: boolean
  needsComparison: boolean
  needsRestore: boolean
}

/** OpenAI-strict schema fragment — attached to every domain tool. */
export const V6_REQUESTED_OPERATIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'needs_collection_search',
    'needs_refinement',
    'needs_sort',
    'needs_slice',
    'needs_exclude',
    'needs_aggregate',
    'needs_group',
    'needs_rank',
    'needs_comparison',
    'needs_restore',
  ],
  properties: {
    needs_collection_search: { type: 'boolean' },
    needs_refinement: { type: 'boolean' },
    needs_sort: { type: 'boolean' },
    needs_slice: { type: 'boolean' },
    needs_exclude: { type: 'boolean' },
    needs_aggregate: {
      type: 'string',
      enum: ['none', 'count', 'sum'],
    },
    needs_group: { type: 'boolean' },
    needs_rank: { type: 'boolean' },
    needs_comparison: { type: 'boolean' },
    needs_restore: { type: 'boolean' },
  },
} as const

export function parseRequestedOperations(
  raw: unknown,
):
  | { ok: true; value: V6RequestedOperations }
  | { ok: false; detail: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, detail: 'requested_operations_required' }
  }
  const r = raw as Record<string, unknown>
  const bool = (k: string) => typeof r[k] === 'boolean'
  if (
    !bool('needs_collection_search') ||
    !bool('needs_refinement') ||
    !bool('needs_sort') ||
    !bool('needs_slice') ||
    !bool('needs_exclude') ||
    !bool('needs_group') ||
    !bool('needs_rank') ||
    !bool('needs_comparison') ||
    !bool('needs_restore')
  ) {
    return { ok: false, detail: 'requested_operations_incomplete' }
  }
  const agg = r.needs_aggregate
  if (agg !== 'none' && agg !== 'count' && agg !== 'sum') {
    return { ok: false, detail: 'requested_operations_bad_aggregate' }
  }
  return {
    ok: true,
    value: {
      needsCollectionSearch: r.needs_collection_search as boolean,
      needsRefinement: r.needs_refinement as boolean,
      needsSort: r.needs_sort as boolean,
      needsSlice: r.needs_slice as boolean,
      needsExclude: r.needs_exclude as boolean,
      needsAggregate: agg,
      needsGroup: r.needs_group as boolean,
      needsRank: r.needs_rank as boolean,
      needsComparison: r.needs_comparison as boolean,
      needsRestore: r.needs_restore as boolean,
    },
  }
}

/**
 * Foundation capability gate: unsupported operation classes → fail closed.
 * No phrase matching.
 */
export function assessRequestedOperationsCapability(
  ops: V6RequestedOperations,
):
  | { supported: true }
  | { supported: false; detail: string } {
  if (ops.needsGroup) {
    return { supported: false, detail: 'group_analytics_not_supported' }
  }
  if (ops.needsRank) {
    return { supported: false, detail: 'rank_analytics_not_supported' }
  }
  if (ops.needsComparison) {
    return { supported: false, detail: 'comparison_analytics_not_supported' }
  }
  return { supported: true }
}

export const V6_CAPABILITY_REGISTRY_TEXT = `SUPPORTED operations:
- root wedding collection search (query_collection)
- temporal filtering (future_from_now, closed_calendar_year, closed_calendar_month, ranges)
- place filter / exclude
- sort
- slice / limit
- count aggregate
- sum canonical finance (contract_value | paid_amount | remaining_amount)
- refine previous collection (transform_collection)
- restore previous collection handle

NOT SUPPORTED operations:
- group / group-by analytics
- rank / top-N ranking across groups
- busiest / most-frequent comparative analytics
- best month / best venue by revenue comparisons
- arbitrary multi-group comparative analytics

Fidelity rule:
If satisfying the user request requires any NOT SUPPORTED operation class,
do not approximate with a weaker supported operation. Return Unsupported.`

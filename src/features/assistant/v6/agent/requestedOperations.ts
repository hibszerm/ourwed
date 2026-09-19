/**
 * V6-F1.3 — Operation-class fidelity declaration (NOT GoalSpec).
 * Tracks required OPERATION families only — no year/place/money slots.
 */
import { buildPlannerConceptCatalogText } from '../registry'

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
- ConceptFilter using registry filterable Business Concepts and their declared comparison operators
- sort by legacy fields or registry sortable Business Concepts
- slice / limit
- member ranking via Sort(sortable concept) + Slice(limit) on a wedding collection
- count aggregate
- sum legacy canonical finance aliases or registry summable Business Concepts
- refine previous collection (transform_collection)
- restore previous collection handle
- inspect 1–6 registry Business Concepts on one referenced wedding (INSPECT_RESOURCE → DETAIL)
- list a bounded related resource using TASKS_OPEN | PAYMENTS | SESSIONS | EXTRAS | PACKAGE_ITEMS | EXTRA_CONTACTS | DAY_PLAN_STOPS (LIST_RELATED → DETAIL)
- inspect bounded wedding place/location detail on a referenced one-wedding collection (INSPECT_WEDDING → output DETAIL)

Temporal contract:
- closed_calendar_month ALWAYS requires temporal.year AND temporal.month (1–12). Never emit that kind with null year/month.
- Resolve relative month phrases to a concrete calendar year+month. Do not leave month identity empty.
- closed_calendar_year requires temporal.year only.

Concept operation selection (from registry catalog ops):
- ops include inspect → INSPECT_RESOURCE with that ConceptKey in inspect_concepts
- ops include list_related → LIST_RELATED with that concept's relationKey in relation (required; never null)
- Never choose LIST_RELATED for an inspect-only scalar (e.g. PKG.NAME, PKG.COVERAGE_HOURS, FIN.CONTRACT_VALUE).
- Never choose INSPECT_RESOURCE for a list_related-only concept (e.g. PKG.ITEMS, PKG.EXTRAS, FIN.PAYMENT_SCHEDULE, TASK.OPEN_LIST).

Member ranking vs aggregate:
- "which wedding has the highest/lowest value of sortable concept X" / "top N by X" → SEARCH or TRANSFORM with Sort(X, direction) + Slice(limit). This is SUPPORTED.
- "how much / how many in total for a set" → AGGREGATE only; do not invent ranking sort/slice.
- Do NOT mark single-collection member ranking as unsupported merely because the wording sounds comparative.

INSPECT_WEDDING detail_selector (typed enum only):
ceremony_place | ceremony_address | reception_place | reception_address |
bride_preparation_place | bride_preparation_address |
groom_preparation_place | groom_preparation_address

PLACE = venue/location identity. ADDRESS = formatted address.
Use the conversational collection handle (input_handle / input_from_step). Never invent wedding UUIDs.
When the user asks for a supported detail ABOUT a wedding already identified by context, use INSPECT_RESOURCE or INSPECT_WEDDING + output.kind=DETAIL — do not answer by merely RESTORE/returning the collection.
Follow-up role switches (e.g. groom preparation → bride for the same detail family) keep the same collection reference and change only detail_selector / inspect_concepts.

NOT SUPPORTED operations:
- group / group-by analytics
- ranking across groups (busiest venue, most-frequent category, multi-group comparisons)
- best month / best venue by revenue comparisons
- notes body, contract body, or questionnaire body
- SESSION as a root collection
- travel route details
- writes or mutations

Fidelity rule:
If satisfying the user request requires any NOT SUPPORTED operation class,
do not approximate with a weaker supported operation. Return Unsupported.
If Sort+Slice or INSPECT_RESOURCE already expresses the meaning, do not return Unsupported.

BUSINESS CONCEPT CATALOG:
Use only listed ConceptKeys. For ConceptFilter use ONLY the filter: operators shown for that concept (e.g. CONTACT.BRIDE_NAME / CONTACT.GROOM_NAME → contains, never eq).

${buildPlannerConceptCatalogText()}`

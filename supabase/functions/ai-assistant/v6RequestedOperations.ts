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
- ConceptFilter using schema-listed Business Concepts and declared comparison operators
- sort by legacy fields or schema-listed sortable Business Concepts
- slice / limit
- member ranking via Sort(sortable concept) + Slice(limit) on a wedding collection
- count aggregate
- sum legacy finance aliases or schema-listed summable Business Concepts
- refine previous collection (transform_collection)
- restore previous collection handle
- inspect 1–6 Business Concepts on one referenced wedding (INSPECT_RESOURCE → DETAIL)
- list TASKS_OPEN | PAYMENTS | SESSIONS | EXTRAS | PACKAGE_ITEMS | EXTRA_CONTACTS | DAY_PLAN_STOPS (LIST_RELATED → DETAIL)
- inspect bounded wedding place/location detail on a referenced one-wedding collection (INSPECT_WEDDING → output DETAIL)

Temporal contract:
- closed_calendar_month ALWAYS requires temporal.year AND temporal.month (1–12). Never emit that kind with null year/month.
- Resolve relative month phrases to a concrete calendar year+month. Do not leave month identity empty.
- closed_calendar_year requires temporal.year only.

Concept operation selection (from schema ConceptKeys / ops):
- inspectable ConceptKey → INSPECT_RESOURCE with inspect_concepts
- list_related ConceptKey → LIST_RELATED with non-null relation
- Never LIST_RELATED for inspect-only scalars (e.g. PKG.NAME).
- Never INSPECT_RESOURCE for list_related-only concepts (e.g. PKG.ITEMS, PKG.EXTRAS, FIN.PAYMENT_SCHEDULE, TASK.OPEN_LIST).

Member ranking vs aggregate:
- highest/lowest / top N by a sortable concept → Sort + Slice. SUPPORTED.
- total sum/count for a set → AGGREGATE only; no invented ranking sort/slice.
- Do NOT mark single-collection member ranking as unsupported comparative analytics.

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

WEDDING
WEDDING.DATE — Calendar date of the wedding. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
WEDDING.DISPLAY_NAME — Human-readable wedding name used in the workspace. [inspect, filter] filter:contains
WEDDING.STATUS — Current lifecycle status of the wedding record. [inspect, filter, aggregate_count] filter:eq|neq
WEDDING.PRIMARY_LOCATION — Primary locality or location associated with the wedding. [inspect, filter] filter:eq|neq|contains
WEDDING.CEREMONY_TIME_SCALAR — Ceremony time stored directly on the wedding record. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes

CONTACT
CONTACT.BRIDE_NAME — Bride name recorded for the wedding. [inspect, filter] filter:contains
CONTACT.GROOM_NAME — Groom name recorded for the wedding. [inspect, filter] filter:contains
CONTACT.BRIDE_PHONE — Bride phone number. [inspect]
CONTACT.GROOM_PHONE — Groom phone number. [inspect]
CONTACT.BRIDE_EMAIL — Bride email address. [inspect]
CONTACT.GROOM_EMAIL — Groom email address. [inspect]
CONTACT.BRIDE_ADDRESS — Bride postal address. [inspect]
CONTACT.GROOM_ADDRESS — Groom postal address. [inspect]
CONTACT.EXTRA_CONTACTS — Additional contacts related to the wedding. [list_related]

PLACE
PLACE.CEREMONY_PLACE — Name of the ceremony venue. [inspect, filter] filter:eq|neq|contains
PLACE.CEREMONY_ADDRESS — Address of the ceremony venue. [inspect]
PLACE.RECEPTION_PLACE — Name of the reception venue. [inspect, filter] filter:eq|neq|contains
PLACE.RECEPTION_ADDRESS — Address of the reception venue. [inspect]
PLACE.BRIDE_PREP_PLACE — Name of the bride preparation location. [inspect, filter] filter:eq|neq|contains
PLACE.BRIDE_PREP_ADDRESS — Address of the bride preparation location. [inspect]
PLACE.GROOM_PREP_PLACE — Name of the groom preparation location. [inspect, filter] filter:eq|neq|contains
PLACE.GROOM_PREP_ADDRESS — Address of the groom preparation location. [inspect]

OPS
OPS.CEREMONY_TIME — Ceremony time in the operational day plan. [inspect]
OPS.BRIDE_PREP_TIME — Bride preparation time in the operational day plan. [inspect]
OPS.GROOM_PREP_TIME — Groom preparation time in the operational day plan. [inspect]
OPS.RECEPTION_TIME — Reception time in the operational day plan. [inspect]
OPS.DAY_PLAN_STOPS — Ordered operational stops in the wedding day plan. [list_related]

PKG
PKG.NAME — Name of the selected package. [inspect, filter] filter:eq|neq|contains
PKG.COVERAGE_HOURS — Number of coverage hours included in the package. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
PKG.ITEMS — Items included in the selected package. [list_related]
PKG.EXTRAS — Extras attached to the wedding package. [list_related]
PKG.EXTRAS_TOTAL — Total monetary value of package extras. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes

FIN
FIN.CONTRACT_VALUE — Total agreed contract value. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.AGREED_DEPOSIT — Agreed deposit amount. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.TOTAL_PAID — Total amount paid for the wedding. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.REMAINING_TO_PAY — Amount currently remaining to be paid. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.REMAINING_AFTER_DEPOSIT — Contract balance after subtracting the agreed deposit. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.DEPOSIT_PAID_AMOUNT — Amount paid toward the deposit. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.DEPOSIT_PAID — Whether the required deposit has been paid. [inspect, filter, aggregate_count] filter:eq|neq
FIN.DEPOSIT_STATUS — Derived payment status of the required deposit. [inspect, filter, aggregate_count] filter:eq|neq
FIN.FINAL_PAYMENT_DUE_DATE — Due date of the final wedding payment. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
FIN.PAYMENT_SCHEDULE — Payment schedule and payment records for the wedding. [list_related]
FIN.CURRENCY — Currency used for wedding financial values. [inspect, filter] filter:eq|neq

CONTRACT
CONTRACT.STATUS — Current contract lifecycle status. [inspect, filter, aggregate_count] filter:eq|neq
CONTRACT.GENERATED_AT — Date and time when the contract was generated. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
CONTRACT.SIGNED_AT — Date and time when the contract was signed. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
CONTRACT.SIGNED — Whether the contract has been signed. [inspect, filter, aggregate_count] filter:eq|neq
CONTRACT.READINESS — Whether contract prerequisites are ready for generation or signing. [inspect, filter, aggregate_count] filter:eq|neq

TASK
TASK.OPEN_COUNT — Number of open tasks for the wedding. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
TASK.HAS_OPEN — Whether the wedding has any open tasks. [inspect, filter, aggregate_count] filter:eq|neq
TASK.OVERDUE_COUNT — Number of overdue open tasks for the wedding. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
TASK.HAS_OVERDUE — Whether the wedding has any overdue open tasks. [inspect, filter, aggregate_count] filter:eq|neq
TASK.NEXT_DUE_DATE — Nearest due date among open tasks. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
TASK.OPEN_LIST — Open tasks related to the wedding. [list_related]

DELIVERY
DELIVERY.DUE_DATE — Expected delivery due date for the wedding materials. [inspect, filter, sort] filter:eq|neq|gt|gte|lt|lte sort:yes
DELIVERY.STATE — Current delivery state for the wedding materials. [inspect, filter, aggregate_count] filter:eq|neq

Q
Q.CONTRACT_STATUS — Completion status of the contract questionnaire. [inspect, filter, aggregate_count] filter:eq|neq
Q.PREWEDDING_STATUS — Completion status of the pre-wedding questionnaire. [inspect, filter, aggregate_count] filter:eq|neq
Q.CONTRACT_COMPLETED — Whether the contract questionnaire is complete. [inspect, filter, aggregate_count] filter:eq|neq
Q.PREWEDDING_COMPLETED — Whether the pre-wedding questionnaire is complete. [inspect, filter, aggregate_count] filter:eq|neq

SESSION
SESSION.HAS_ANY — Whether the wedding has any related sessions. [inspect, filter, aggregate_count] filter:eq|neq
SESSION.COUNT — Number of sessions related to the wedding. [inspect, filter, sort, aggregate_sum] filter:eq|neq|gt|gte|lt|lte sort:yes
SESSION.LIST — Sessions related to the wedding. [list_related]

TRAVEL
TRAVEL.FEE_STATUS — Resolution status of the wedding travel fee. [inspect]
TRAVEL.EFFECTIVE_FEE — Effective travel fee after route resolution. [inspect, aggregate_sum]
TRAVEL.RESOLVED — Whether the wedding travel route and fee are resolved. [inspect]

WORKFLOW
WORKFLOW.STAGE — Internal workflow stage identifier for the wedding. [inspect]
WORKFLOW.STAGE_LABEL — Human-readable workflow stage label. [inspect]
`

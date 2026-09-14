/**
 * V6-F1.3 — Native OpenAI strict function-calling tool schemas.
 * Domain tools only (no model-facing complete_turn).
 */

import { V6_REQUESTED_OPERATIONS_SCHEMA } from './requestedOperations'

function nullableObject(
  required: string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: ['object', 'null'],
    additionalProperties: false,
    required,
    properties,
  }
}

export const V6_PLACE_FILTER_PROPERTIES = {
  field: { type: 'string', enum: ['place.name'] },
  op: { type: 'string', enum: ['contains', 'eq'] },
  value: { type: 'string' },
  role: {
    type: ['string', 'null'],
    enum: ['preparations', 'ceremony', 'reception', 'any', null],
  },
} as const

export const V6_TEMPORAL_PROPERTIES = {
  kind: {
    type: 'string',
    enum: [
      'future_from_now',
      'past_until_now',
      'closed_range',
      'closed_calendar_year',
      'closed_calendar_month',
    ],
  },
  inclusive: { type: ['boolean', 'null'] },
  year: { type: ['number', 'null'] },
  month: { type: ['number', 'null'] },
  from_kind: {
    type: ['string', 'null'],
    enum: ['now', 'absolute', 'calendar_year', 'calendar_month', null],
  },
  from_date: { type: ['string', 'null'] },
  from_year: { type: ['number', 'null'] },
  from_month: { type: ['number', 'null'] },
  to_kind: {
    type: ['string', 'null'],
    enum: ['now', 'absolute', 'calendar_year', 'calendar_month', null],
  },
  to_date: { type: ['string', 'null'] },
  to_year: { type: ['number', 'null'] },
  to_month: { type: ['number', 'null'] },
} as const

const TEMPORAL_REQUIRED = [
  'kind',
  'inclusive',
  'year',
  'month',
  'from_kind',
  'from_date',
  'from_year',
  'from_month',
  'to_kind',
  'to_date',
  'to_year',
  'to_month',
]

export const V6_SORT_PROPERTIES = {
  field: {
    type: 'string',
    enum: [
      'wedding.date',
      'contract_value',
      'paid_amount',
      'remaining_amount',
    ],
  },
  direction: { type: 'string', enum: ['asc', 'desc'] },
} as const

export const V6_SLICE_PROPERTIES = {
  limit: { type: 'number' },
  offset: { type: ['number', 'null'] },
} as const

export const V6_EXCLUDE_PROPERTIES = {
  by: { type: 'string', enum: ['ordinal', 'place_contains'] },
  ordinal: { type: ['number', 'null'] },
  place_value: { type: ['string', 'null'] },
  place_role: {
    type: ['string', 'null'],
    enum: ['preparations', 'ceremony', 'reception', 'any', null],
  },
} as const

export const V6_FILTER_OP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['op', 'place', 'temporal', 'sort', 'slice', 'exclude'],
  properties: {
    op: {
      type: 'string',
      enum: ['Filter', 'RelativeTemporal', 'Sort', 'Slice', 'Exclude'],
    },
    place: nullableObject(
      ['field', 'op', 'value', 'role'],
      V6_PLACE_FILTER_PROPERTIES,
    ),
    temporal: nullableObject(TEMPORAL_REQUIRED, V6_TEMPORAL_PROPERTIES),
    sort: nullableObject(['field', 'direction'], V6_SORT_PROPERTIES),
    slice: nullableObject(['limit', 'offset'], V6_SLICE_PROPERTIES),
    exclude: nullableObject(
      ['by', 'ordinal', 'place_value', 'place_role'],
      V6_EXCLUDE_PROPERTIES,
    ),
  },
} as const

export const QUERY_COLLECTION_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: [
    'requested_operations',
    'source',
    'filters',
    'exclude_place',
    'temporal',
    'sort',
    'slice',
  ],
  properties: {
    requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
    source: { type: 'string', enum: ['wedding'] },
    filters: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'op', 'value', 'role'],
        properties: V6_PLACE_FILTER_PROPERTIES,
      },
    },
    exclude_place: nullableObject(
      ['field', 'op', 'value', 'role'],
      V6_PLACE_FILTER_PROPERTIES,
    ),
    temporal: nullableObject(TEMPORAL_REQUIRED, V6_TEMPORAL_PROPERTIES),
    sort: nullableObject(['field', 'direction'], V6_SORT_PROPERTIES),
    slice: nullableObject(['limit', 'offset'], V6_SLICE_PROPERTIES),
  },
} as const

export const TRANSFORM_COLLECTION_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['requested_operations', 'parent_handle', 'ops'],
  properties: {
    requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
    parent_handle: { type: 'string' },
    ops: {
      type: 'array',
      minItems: 1,
      items: V6_FILTER_OP_SCHEMA,
    },
  },
} as const

export const AGGREGATE_COLLECTION_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['requested_operations', 'collection', 'aggregation', 'measure'],
  properties: {
    requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
    collection: { type: 'string' },
    aggregation: { type: 'string', enum: ['count', 'sum'] },
    measure: {
      type: ['string', 'null'],
      enum: ['contract_value', 'paid_amount', 'remaining_amount', null],
    },
  },
} as const

export const RESTORE_COLLECTION_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['requested_operations', 'collection'],
  properties: {
    requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
    collection: { type: 'string' },
  },
} as const

/** Non-tool structured outcome (used with tool_choice none). */
export const V6_OUTCOME_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'text', 'slot', 'reason', 'candidates'],
  properties: {
    status: {
      type: 'string',
      enum: ['final', 'clarify', 'unsupported'],
    },
    text: { type: ['string', 'null'] },
    slot: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    candidates: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const

function fn(
  name: string,
  description: string,
  parameters: unknown,
): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name,
      description,
      strict: true,
      parameters,
    },
  }
}

export const V6_NATIVE_OPENAI_TOOLS: Array<Record<string, unknown>> = [
  fn(
    'query_collection',
    'Create a NEW root wedding collection from typed search criteria (temporal, place filters, sort, slice). Use for a fresh search — not to refine an existing collection handle. Month/year constraints use temporal (closed_calendar_month / closed_calendar_year), never place Filter.',
    QUERY_COLLECTION_PARAMETERS,
  ),
  fn(
    'transform_collection',
    'Derive a child collection from an EXISTING collection handle and preserve membership scope (child ⊆ parent). Use when the user refers to a prior result set. Place refine uses Filter; month/year refine uses RelativeTemporal. Do not create a new global search when the intended operation is a refinement of that collection.',
    TRANSFORM_COLLECTION_PARAMETERS,
  ),
  fn(
    'aggregate_collection',
    'Calculate count or sum over an EXISTING collection handle without changing the active collection. Money measures must use contract_value, paid_amount, or remaining_amount — never invent arithmetic. After a successful aggregate, answer from the observation — do not re-call the same aggregate.',
    AGGREGATE_COLLECTION_PARAMETERS,
  ),
  fn(
    'restore_collection',
    'Activate an existing historical collection handle (e.g. return to a prior set). Do not re-query or rebuild the collection from language. After a successful restore, answer from the collection observation — do not restore again.',
    RESTORE_COLLECTION_PARAMETERS,
  ),
]

export const V6_DOMAIN_TOOL_NAMES = [
  'query_collection',
  'transform_collection',
  'aggregate_collection',
  'restore_collection',
] as const

export type V6DomainToolName = (typeof V6_DOMAIN_TOOL_NAMES)[number]

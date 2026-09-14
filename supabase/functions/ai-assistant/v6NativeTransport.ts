/**
 * V6-F1.3 — Edge native tools (Deno). Domain tools only; mapping on client.
 */

import { V6_REQUESTED_OPERATIONS_SCHEMA } from './v6RequestedOperations.ts'

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

const PLACE_PROPS = {
  field: { type: 'string', enum: ['place.name'] },
  op: { type: 'string', enum: ['contains', 'eq'] },
  value: { type: 'string' },
  role: {
    type: ['string', 'null'],
    enum: ['preparations', 'ceremony', 'reception', 'any', null],
  },
}

const TEMPORAL_PROPS = {
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
}

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

const SORT_PROPS = {
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
}

const SLICE_PROPS = {
  limit: { type: 'number' },
  offset: { type: ['number', 'null'] },
}

const EXCLUDE_PROPS = {
  by: { type: 'string', enum: ['ordinal', 'place_contains'] },
  ordinal: { type: ['number', 'null'] },
  place_value: { type: ['string', 'null'] },
  place_role: {
    type: ['string', 'null'],
    enum: ['preparations', 'ceremony', 'reception', 'any', null],
  },
}

const FILTER_OP = {
  type: 'object',
  additionalProperties: false,
  required: ['op', 'place', 'temporal', 'sort', 'slice', 'exclude'],
  properties: {
    op: {
      type: 'string',
      enum: ['Filter', 'RelativeTemporal', 'Sort', 'Slice', 'Exclude'],
    },
    place: nullableObject(['field', 'op', 'value', 'role'], PLACE_PROPS),
    temporal: nullableObject(TEMPORAL_REQUIRED, TEMPORAL_PROPS),
    sort: nullableObject(['field', 'direction'], SORT_PROPS),
    slice: nullableObject(['limit', 'offset'], SLICE_PROPS),
    exclude: nullableObject(
      ['by', 'ordinal', 'place_value', 'place_role'],
      EXCLUDE_PROPS,
    ),
  },
}

function fn(name: string, description: string, parameters: unknown) {
  return {
    type: 'function',
    function: { name, description, strict: true, parameters },
  }
}

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
}

export const V6_NATIVE_OPENAI_TOOLS = [
  fn(
    'query_collection',
    'Create a NEW root wedding collection from typed search criteria. Month/year use temporal, never place Filter.',
    {
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
            properties: PLACE_PROPS,
          },
        },
        exclude_place: nullableObject(
          ['field', 'op', 'value', 'role'],
          PLACE_PROPS,
        ),
        temporal: nullableObject(TEMPORAL_REQUIRED, TEMPORAL_PROPS),
        sort: nullableObject(['field', 'direction'], SORT_PROPS),
        slice: nullableObject(['limit', 'offset'], SLICE_PROPS),
      },
    },
  ),
  fn(
    'transform_collection',
    'Derive a child collection from an EXISTING handle (child ⊆ parent). Place=Filter; month/year=RelativeTemporal.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['requested_operations', 'parent_handle', 'ops'],
      properties: {
        requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
        parent_handle: { type: 'string' },
        ops: { type: 'array', minItems: 1, items: FILTER_OP },
      },
    },
  ),
  fn(
    'aggregate_collection',
    'Count or sum over an EXISTING handle without changing active collection.',
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'requested_operations',
        'collection',
        'aggregation',
        'measure',
      ],
      properties: {
        requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
        collection: { type: 'string' },
        aggregation: { type: 'string', enum: ['count', 'sum'] },
        measure: {
          type: ['string', 'null'],
          enum: ['contract_value', 'paid_amount', 'remaining_amount', null],
        },
      },
    },
  ),
  fn(
    'restore_collection',
    'Activate an existing historical collection handle. Do not re-query.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['requested_operations', 'collection'],
      properties: {
        requested_operations: V6_REQUESTED_OPERATIONS_SCHEMA,
        collection: { type: 'string' },
      },
    },
  ),
]

export function buildV6NativeToolsRequestBody(input: {
  model: string
  messages: Array<Record<string, unknown>>
  maxOutputTokens?: number
  mode?: 'tools' | 'outcome'
}): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1200
  const mode = input.mode ?? 'tools'
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  }
  if (mode === 'outcome') {
    // Do NOT set tool_choice without tools — OpenAI rejects it.
    base.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'assistant_v6_outcome',
        strict: true,
        schema: V6_OUTCOME_JSON_SCHEMA,
      },
    }
  } else {
    base.tools = V6_NATIVE_OPENAI_TOOLS
    base.tool_choice = 'auto'
    base.parallel_tool_calls = false
  }
  if (input.model.trim() === 'gpt-5.6-luna') {
    base.max_completion_tokens = maxOutputTokens
    base.reasoning_effort = 'none'
    return base
  }
  base.temperature = 0
  base.max_tokens = maxOutputTokens
  return base
}

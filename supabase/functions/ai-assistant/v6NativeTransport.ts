/**
 * V6-F1.2 — Edge native tools request builder (Deno).
 * Mirrors client v6OpenAITransport + nativeTools. Mapping happens on the client.
 */

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

export const V6_NATIVE_OPENAI_TOOLS = [
  fn(
    'query_collection',
    'Create a NEW root wedding collection from typed search criteria (temporal, place filters, sort, slice). Use for a fresh search — not to refine an existing collection handle.',
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'source',
        'filters',
        'exclude_place',
        'temporal',
        'sort',
        'slice',
      ],
      properties: {
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
    'Derive a child collection from an EXISTING collection handle and preserve membership scope (child ⊆ parent). Use when the user refers to a prior result set. Do not create a new global search when the intended operation is a refinement of that collection.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['parent_handle', 'ops'],
      properties: {
        parent_handle: { type: 'string' },
        ops: { type: 'array', minItems: 1, items: FILTER_OP },
      },
    },
  ),
  fn(
    'aggregate_collection',
    'Calculate count or sum over an EXISTING collection handle without changing the active collection. Money measures must use contract_value, paid_amount, or remaining_amount — never invent arithmetic.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['collection', 'aggregation', 'measure'],
      properties: {
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
    'Activate an existing historical collection handle (e.g. return to a prior set). Do not re-query or rebuild the collection from language.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['collection'],
      properties: { collection: { type: 'string' } },
    },
  ),
  fn(
    'complete_turn',
    'End this planning turn with a final answer, a clarification question, or an unsupported capability outcome. Use when no further domain tool call is needed, or when the request cannot be satisfied with enabled tools without silent simplification.',
    {
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
    },
  ),
]

export function buildV6NativeToolsRequestBody(input: {
  model: string
  messages: Array<Record<string, unknown>>
  maxOutputTokens?: number
}): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1200
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    tools: V6_NATIVE_OPENAI_TOOLS,
    tool_choice: 'auto',
    parallel_tool_calls: false,
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

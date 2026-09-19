/**
 * V6-F1.3 — Edge native tools (Deno). Domain tools only; mapping on client.
 */

import { V6_REQUESTED_OPERATIONS_SCHEMA } from './v6RequestedOperations.ts'

const ALL_CONCEPT_KEYS = [
  'WEDDING.DATE', 'WEDDING.DISPLAY_NAME', 'WEDDING.STATUS',
  'WEDDING.PRIMARY_LOCATION', 'WEDDING.CEREMONY_TIME_SCALAR',
  'CONTACT.BRIDE_NAME', 'CONTACT.GROOM_NAME', 'CONTACT.BRIDE_PHONE',
  'CONTACT.GROOM_PHONE', 'CONTACT.BRIDE_EMAIL', 'CONTACT.GROOM_EMAIL',
  'CONTACT.BRIDE_ADDRESS', 'CONTACT.GROOM_ADDRESS', 'CONTACT.EXTRA_CONTACTS',
  'PLACE.CEREMONY_PLACE', 'PLACE.CEREMONY_ADDRESS', 'PLACE.RECEPTION_PLACE',
  'PLACE.RECEPTION_ADDRESS', 'PLACE.BRIDE_PREP_PLACE',
  'PLACE.BRIDE_PREP_ADDRESS', 'PLACE.GROOM_PREP_PLACE',
  'PLACE.GROOM_PREP_ADDRESS', 'OPS.CEREMONY_TIME', 'OPS.BRIDE_PREP_TIME',
  'OPS.GROOM_PREP_TIME', 'OPS.RECEPTION_TIME', 'OPS.DAY_PLAN_STOPS',
  'PKG.NAME', 'PKG.COVERAGE_HOURS', 'PKG.ITEMS', 'PKG.EXTRAS',
  'PKG.EXTRAS_TOTAL', 'FIN.CONTRACT_VALUE', 'FIN.AGREED_DEPOSIT',
  'FIN.TOTAL_PAID', 'FIN.REMAINING_TO_PAY', 'FIN.REMAINING_AFTER_DEPOSIT',
  'FIN.DEPOSIT_PAID_AMOUNT', 'FIN.DEPOSIT_PAID', 'FIN.DEPOSIT_STATUS',
  'FIN.FINAL_PAYMENT_DUE_DATE', 'FIN.PAYMENT_SCHEDULE', 'FIN.CURRENCY',
  'CONTRACT.STATUS', 'CONTRACT.GENERATED_AT', 'CONTRACT.SIGNED_AT',
  'CONTRACT.SIGNED', 'CONTRACT.READINESS', 'TASK.OPEN_COUNT',
  'TASK.HAS_OPEN', 'TASK.OVERDUE_COUNT', 'TASK.HAS_OVERDUE',
  'TASK.NEXT_DUE_DATE', 'TASK.OPEN_LIST', 'DELIVERY.DUE_DATE',
  'DELIVERY.STATE', 'Q.CONTRACT_STATUS', 'Q.PREWEDDING_STATUS',
  'Q.CONTRACT_COMPLETED', 'Q.PREWEDDING_COMPLETED', 'SESSION.HAS_ANY',
  'SESSION.COUNT', 'SESSION.LIST', 'TRAVEL.FEE_STATUS',
  'TRAVEL.EFFECTIVE_FEE', 'TRAVEL.RESOLVED', 'WORKFLOW.STAGE',
  'WORKFLOW.STAGE_LABEL',
] as const

const SORTABLE_CONCEPT_KEYS = [
  'WEDDING.DATE', 'WEDDING.CEREMONY_TIME_SCALAR', 'PKG.COVERAGE_HOURS',
  'PKG.EXTRAS_TOTAL', 'FIN.CONTRACT_VALUE', 'FIN.AGREED_DEPOSIT',
  'FIN.TOTAL_PAID', 'FIN.REMAINING_TO_PAY', 'FIN.REMAINING_AFTER_DEPOSIT',
  'FIN.DEPOSIT_PAID_AMOUNT', 'FIN.FINAL_PAYMENT_DUE_DATE',
  'CONTRACT.GENERATED_AT', 'CONTRACT.SIGNED_AT', 'TASK.OPEN_COUNT',
  'TASK.OVERDUE_COUNT', 'TASK.NEXT_DUE_DATE', 'DELIVERY.DUE_DATE',
  'SESSION.COUNT',
] as const

const SUMMABLE_CONCEPT_KEYS = [
  'PKG.EXTRAS_TOTAL', 'FIN.CONTRACT_VALUE', 'FIN.AGREED_DEPOSIT',
  'FIN.TOTAL_PAID', 'FIN.REMAINING_TO_PAY', 'FIN.REMAINING_AFTER_DEPOSIT',
  'FIN.DEPOSIT_PAID_AMOUNT', 'TASK.OPEN_COUNT', 'TASK.OVERDUE_COUNT',
  'SESSION.COUNT', 'TRAVEL.EFFECTIVE_FEE',
] as const

const RELATION_KEYS = [
  'EXTRA_CONTACTS', 'DAY_PLAN_STOPS', 'PACKAGE_ITEMS', 'EXTRAS',
  'PAYMENTS', 'TASKS_OPEN', 'SESSIONS',
] as const

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

const CONCEPT_FILTER_PROPS = {
  concept: { type: 'string', enum: [...ALL_CONCEPT_KEYS] },
  cmp: {
    type: 'string',
    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'],
  },
  bool_value: { type: ['boolean', 'null'] },
  number_value: { type: ['number', 'null'] },
  string_value: { type: ['string', 'null'] },
}

const CONCEPT_FILTER = {
  type: 'object',
  additionalProperties: false,
  required: ['concept', 'cmp', 'bool_value', 'number_value', 'string_value'],
  properties: CONCEPT_FILTER_PROPS,
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
    description:
      'Temporal kind. closed_calendar_month requires year and month (1-12). closed_calendar_year requires year.',
  },
  inclusive: { type: ['boolean', 'null'] },
  year: {
    type: ['number', 'null'],
    description:
      'Required calendar year when kind is closed_calendar_year or closed_calendar_month.',
  },
  month: {
    type: ['number', 'null'],
    description:
      'Required calendar month 1-12 when kind is closed_calendar_month. Never null for that kind.',
  },
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
      ...SORTABLE_CONCEPT_KEYS,
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
  required: ['op', 'place', 'concept_filter', 'temporal', 'sort', 'slice', 'exclude'],
  properties: {
    op: {
      type: 'string',
      enum: ['Filter', 'ConceptFilter', 'RelativeTemporal', 'Sort', 'Slice', 'Exclude'],
    },
    place: nullableObject(['field', 'op', 'value', 'role'], PLACE_PROPS),
    concept_filter: nullableObject(
      ['concept', 'cmp', 'bool_value', 'number_value', 'string_value'],
      CONCEPT_FILTER_PROPS,
    ),
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

const V6_TURN_PLAN_SEARCH_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['source', 'filters', 'concept_filters', 'exclude_place', 'temporal', 'sort', 'slice'],
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
    concept_filters: {
      type: ['array', 'null'],
      items: CONCEPT_FILTER,
    },
    exclude_place: nullableObject(
      ['field', 'op', 'value', 'role'],
      PLACE_PROPS,
    ),
    temporal: nullableObject(TEMPORAL_REQUIRED, TEMPORAL_PROPS),
    sort: nullableObject(['field', 'direction'], SORT_PROPS),
    slice: nullableObject(['limit', 'offset'], SLICE_PROPS),
  },
}

const V6_TURN_PLAN_STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'input_from_step',
    'input_handle',
    'search',
    'transform_ops',
    'aggregation',
    'measure',
    'detail_selector',
    'inspect_concepts',
    'relation',
    'relation_limit',
  ],
  properties: {
    id: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'SEARCH_COLLECTION',
        'TRANSFORM_COLLECTION',
        'AGGREGATE_COLLECTION',
        'RESTORE_COLLECTION',
        'INSPECT_WEDDING',
        'INSPECT_RESOURCE',
        'LIST_RELATED',
      ],
    },
    input_from_step: { type: ['string', 'null'] },
    input_handle: { type: ['string', 'null'] },
    search: V6_TURN_PLAN_SEARCH_SCHEMA,
    transform_ops: {
      type: ['array', 'null'],
      items: FILTER_OP,
    },
    aggregation: {
      type: ['string', 'null'],
      enum: ['count', 'sum', null],
    },
    measure: {
      type: ['string', 'null'],
      enum: ['contract_value', 'paid_amount', 'remaining_amount', ...SUMMABLE_CONCEPT_KEYS, null],
    },
    detail_selector: {
      type: ['string', 'null'],
      enum: [
        'ceremony_place',
        'ceremony_address',
        'reception_place',
        'reception_address',
        'bride_preparation_place',
        'bride_preparation_address',
        'groom_preparation_place',
        'groom_preparation_address',
        null,
      ],
    },
    inspect_concepts: {
      type: ['array', 'null'],
      description:
        'Required for INSPECT_RESOURCE: 1–6 inspectable ConceptKeys. Null for other step kinds.',
      items: { type: 'string', enum: [...ALL_CONCEPT_KEYS] },
    },
    relation: {
      type: ['string', 'null'],
      description:
        'Required non-null RelationKey when kind is LIST_RELATED. Null for other step kinds.',
      enum: [...RELATION_KEYS, null],
    },
    relation_limit: { type: ['number', 'null'] },
  },
}

export const V6_TURN_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['steps', 'output'],
  properties: {
    steps: {
      type: 'array',
      maxItems: 6,
      items: V6_TURN_PLAN_STEP_SCHEMA,
    },
    output: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'from_step', 'reason', 'slot', 'text'],
      properties: {
        kind: {
          type: 'string',
          enum: [
            'COLLECTION',
            'AGGREGATE',
            'DETAIL',
            'CLARIFICATION',
            'UNSUPPORTED',
          ],
        },
        from_step: { type: ['string', 'null'] },
        reason: { type: ['string', 'null'] },
        slot: { type: ['string', 'null'] },
        text: { type: ['string', 'null'] },
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
        'concept_filters',
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
        concept_filters: {
          type: ['array', 'null'],
          items: CONCEPT_FILTER,
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
          enum: ['contract_value', 'paid_amount', 'remaining_amount', ...SUMMABLE_CONCEPT_KEYS, null],
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
  mode?: 'turn_plan' | 'tools' | 'outcome'
}): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 1600
  const mode = input.mode ?? 'turn_plan'
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  }
  if (mode === 'turn_plan') {
    base.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'assistant_v6_turn_plan',
        strict: true,
        schema: V6_TURN_PLAN_JSON_SCHEMA,
      },
    }
  } else if (mode === 'outcome') {
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

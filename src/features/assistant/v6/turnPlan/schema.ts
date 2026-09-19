/**
 * V6-F1.4 / V6-DR1 — OpenAI-strict TurnPlan JSON schema (response_format).
 * Flat nullable bags — no oneOf, no free-form JSON, no aliases.
 */

import {
  V6_FILTER_OP_SCHEMA,
  V6_CONCEPT_FILTER_SCHEMA,
  V6_PLACE_FILTER_PROPERTIES,
  V6_SORT_PROPERTIES,
  V6_SLICE_PROPERTIES,
  V6_TEMPORAL_PROPERTIES,
} from '../agent/nativeTools'
import { V6_WEDDING_PLACE_DETAIL_SELECTORS } from '../detail/weddingPlaceDetail'
import {
  ALL_CONCEPT_KEYS,
  ALL_RELATION_KEYS,
  SUMMABLE_CONCEPT_KEYS,
} from '../registry'

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

/** Search payload inside a SEARCH_COLLECTION step (no RequestedOperations). */
export const V6_TURN_PLAN_SEARCH_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: [
    'source',
    'filters',
    'concept_filters',
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
        properties: V6_PLACE_FILTER_PROPERTIES,
      },
    },
    concept_filters: {
      type: ['array', 'null'],
      items: V6_CONCEPT_FILTER_SCHEMA,
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

export const V6_TURN_PLAN_STEP_SCHEMA = {
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
      items: V6_FILTER_OP_SCHEMA,
    },
    aggregation: {
      type: ['string', 'null'],
      enum: ['count', 'sum', null],
    },
    measure: {
      type: ['string', 'null'],
      enum: [
        'contract_value',
        'paid_amount',
        'remaining_amount',
        ...SUMMABLE_CONCEPT_KEYS,
        null,
      ],
    },
    detail_selector: {
      type: ['string', 'null'],
      enum: [...V6_WEDDING_PLACE_DETAIL_SELECTORS, null],
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
      enum: [...ALL_RELATION_KEYS, null],
    },
    relation_limit: { type: ['number', 'null'] },
  },
} as const

export const V6_TURN_PLAN_OUTPUT_SCHEMA = {
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
} as const

/** Strict json_schema for chat.completions response_format / Responses text.format */
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
    output: V6_TURN_PLAN_OUTPUT_SCHEMA,
  },
} as const

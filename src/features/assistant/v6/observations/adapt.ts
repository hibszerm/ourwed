/**
 * V6-F1 — Thin observation adapters for shadow diagnostics / future UI.
 */

import type { AggregateCollectionSuccess } from '../tools/aggregateCollection'
import type { QueryCollectionSuccess } from '../tools/queryCollection'
import type { TransformCollectionSuccess } from '../tools/transformCollection'

export type V6Observation =
  | {
      kind: 'collection_result'
      handle: string
      totalCount: number
      preview: QueryCollectionSuccess['preview']
    }
  | {
      kind: 'count_result'
      handle: string
      value: number
      provenance: 'collection_count'
    }
  | {
      kind: 'money_aggregate'
      handle: string
      measure: string
      aggregation: 'sum'
      value: number
      currency: 'PLN'
      provenance: 'canonical_finance'
    }
  | { kind: 'clarification'; slot: string; reason: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'safe_error'; code: string; detail: string }

export function observationFromQuery(
  data: QueryCollectionSuccess,
): V6Observation {
  return {
    kind: 'collection_result',
    handle: data.handle,
    totalCount: data.totalCount,
    preview: data.preview,
  }
}

export function observationFromTransform(
  data: TransformCollectionSuccess,
): V6Observation {
  return {
    kind: 'collection_result',
    handle: data.handle,
    totalCount: data.totalCount,
    preview: data.preview,
  }
}

export function observationFromAggregate(
  data: AggregateCollectionSuccess,
): V6Observation {
  if (data.kind === 'count_result') {
    return {
      kind: 'count_result',
      handle: data.collectionHandle,
      value: data.value,
      provenance: 'collection_count',
    }
  }
  return {
    kind: 'money_aggregate',
    handle: data.collectionHandle,
    measure: data.measure ?? 'contract_value',
    aggregation: 'sum',
    value: data.value,
    currency: 'PLN',
    provenance: 'canonical_finance',
  }
}

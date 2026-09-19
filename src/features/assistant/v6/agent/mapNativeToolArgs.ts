/**
 * V6-F1.2 — Map native strict tool arguments → V6 runtime types.
 * No alias vocabulary. Reject unknown shapes fail-closed.
 */

import type {
  SearchAction,
  AggregateAction,
  RestoreAction,
  V6FilterOp,
  V6ConceptPredicate,
  V6PlaceFilter,
  V6RelativeTemporal,
  V6Sort,
  V6Slice,
  V6TemporalAnchor,
} from '../semantics/types'
import {
  isConceptKey,
  resolveAggregateConcept,
  resolveSortConcept,
} from '../registry'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export type NativeMapFailure = {
  ok: false
  reason: 'VALIDATION_ERROR'
  detail: string
}

function mapPlace(raw: unknown): V6PlaceFilter | null | NativeMapFailure {
  if (raw === null) return null
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_place' }
  }
  if (raw.field !== 'place.name') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_place_field' }
  }
  if (raw.op !== 'contains' && raw.op !== 'eq') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_place_op' }
  }
  if (typeof raw.value !== 'string' || !raw.value.trim()) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_place_value' }
  }
  const place: V6PlaceFilter = {
    field: 'place.name',
    op: raw.op,
    value: raw.value,
  }
  if (
    raw.role === 'preparations' ||
    raw.role === 'ceremony' ||
    raw.role === 'reception' ||
    raw.role === 'any'
  ) {
    place.role = raw.role
  }
  return place
}

function mapAnchor(
  kind: unknown,
  date: unknown,
  year: unknown,
  month: unknown,
): V6TemporalAnchor | null | NativeMapFailure {
  if (kind === null || kind === undefined) return null
  if (kind === 'now') return { kind: 'now' }
  if (kind === 'absolute') {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_absolute_date' }
    }
    return { kind: 'absolute', date }
  }
  if (kind === 'calendar_year') {
    if (typeof year !== 'number' || !Number.isFinite(year)) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_anchor_year' }
    }
    return { kind: 'calendar_year', year }
  }
  if (kind === 'calendar_month') {
    if (
      typeof year !== 'number' ||
      typeof month !== 'number' ||
      !Number.isFinite(year) ||
      !Number.isFinite(month)
    ) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_anchor_month' }
    }
    return { kind: 'calendar_month', year, month }
  }
  return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_anchor_kind' }
}

function mapTemporal(raw: unknown): V6RelativeTemporal | null | NativeMapFailure {
  if (raw === null) return null
  if (!isPlainObject(raw) || typeof raw.kind !== 'string') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_temporal' }
  }
  if (raw.kind === 'future_from_now' || raw.kind === 'past_until_now') {
    if (typeof raw.inclusive !== 'boolean') {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'temporal_inclusive_required',
      }
    }
    return { kind: raw.kind, inclusive: raw.inclusive }
  }
  if (raw.kind === 'closed_calendar_year') {
    if (typeof raw.year !== 'number' || !Number.isFinite(raw.year)) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'year_required' }
    }
    return { kind: 'closed_calendar_year', year: raw.year }
  }
  if (raw.kind === 'closed_calendar_month') {
    if (typeof raw.year !== 'number' || !Number.isFinite(raw.year)) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'closed_calendar_month_year_required',
      }
    }
    if (
      typeof raw.month !== 'number' ||
      !Number.isFinite(raw.month) ||
      raw.month < 1 ||
      raw.month > 12
    ) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'closed_calendar_month_month_required',
      }
    }
    return {
      kind: 'closed_calendar_month',
      year: raw.year,
      month: raw.month,
    }
  }
  if (raw.kind === 'closed_range') {
    const from = mapAnchor(
      raw.from_kind,
      raw.from_date,
      raw.from_year,
      raw.from_month,
    )
    const to = mapAnchor(raw.to_kind, raw.to_date, raw.to_year, raw.to_month)
    if (from && typeof from === 'object' && 'ok' in from && from.ok === false) {
      return from
    }
    if (to && typeof to === 'object' && 'ok' in to && to.ok === false) {
      return to
    }
    if (!from || !to) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'closed_range_requires_bounds',
      }
    }
    return {
      kind: 'closed_range',
      from: from as V6TemporalAnchor,
      to: to as V6TemporalAnchor,
    }
  }
  return { ok: false, reason: 'VALIDATION_ERROR', detail: 'unknown_temporal_kind' }
}

function mapSort(raw: unknown): V6Sort | null | NativeMapFailure {
  if (raw === null) return null
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_sort' }
  }
  const field = raw.field
  if (typeof field !== 'string' || !resolveSortConcept(field)) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_sort_field' }
  }
  if (raw.direction !== 'asc' && raw.direction !== 'desc') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_sort_direction' }
  }
  return { field, direction: raw.direction }
}

export function mapConceptFilter(
  raw: unknown,
): V6ConceptPredicate | NativeMapFailure {
  if (!isPlainObject(raw) || !isConceptKey(raw.concept)) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_concept_filter' }
  }
  if (
    raw.cmp !== 'eq' &&
    raw.cmp !== 'neq' &&
    raw.cmp !== 'gt' &&
    raw.cmp !== 'gte' &&
    raw.cmp !== 'lt' &&
    raw.cmp !== 'lte' &&
    raw.cmp !== 'contains'
  ) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_concept_cmp' }
  }
  const bag = [raw.bool_value, raw.number_value, raw.string_value]
  if (
    bag.some(
      (value, index) =>
        value !== null &&
        (index === 0
          ? typeof value !== 'boolean'
          : index === 1
            ? typeof value !== 'number' || !Number.isFinite(value)
            : typeof value !== 'string'),
    )
  ) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_concept_value' }
  }
  const values = bag.filter((value) => value !== null)
  if (values.length > 1) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'concept_value_must_have_one_type',
    }
  }
  return {
    concept: raw.concept,
    cmp: raw.cmp,
    value: (values[0] ?? null) as V6ConceptPredicate['value'],
  }
}

function mapSlice(raw: unknown): V6Slice | null | NativeMapFailure {
  if (raw === null) return null
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_slice' }
  }
  if (typeof raw.limit !== 'number' || !Number.isFinite(raw.limit) || raw.limit < 1) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_slice_limit' }
  }
  const slice: V6Slice = { limit: raw.limit }
  if (typeof raw.offset === 'number' && Number.isFinite(raw.offset) && raw.offset >= 0) {
    slice.offset = raw.offset
  }
  return slice
}

function isFail(v: unknown): v is NativeMapFailure {
  return (
    !!v &&
    typeof v === 'object' &&
    'ok' in v &&
    (v as { ok: unknown }).ok === false
  )
}

function mapFilterOp(raw: unknown): V6FilterOp | NativeMapFailure {
  if (!isPlainObject(raw) || typeof raw.op !== 'string') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_op' }
  }
  if (raw.op === 'Filter') {
    const place = mapPlace(raw.place)
    if (isFail(place)) return place
    if (!place) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'filter_requires_place' }
    }
    return { op: 'Filter', place }
  }
  if (raw.op === 'ConceptFilter') {
    const predicate = mapConceptFilter(raw.concept_filter)
    if (isFail(predicate)) return predicate
    return { op: 'ConceptFilter', predicate }
  }
  if (raw.op === 'RelativeTemporal') {
    const temporal = mapTemporal(raw.temporal)
    if (isFail(temporal)) return temporal
    if (!temporal) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'relative_temporal_required',
      }
    }
    return { op: 'RelativeTemporal', temporal }
  }
  if (raw.op === 'Sort') {
    const sort = mapSort(raw.sort)
    if (isFail(sort)) return sort
    if (!sort) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'sort_required' }
    }
    return { op: 'Sort', sort }
  }
  if (raw.op === 'Slice') {
    const slice = mapSlice(raw.slice)
    if (isFail(slice)) return slice
    if (!slice) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'slice_required' }
    }
    return { op: 'Slice', slice }
  }
  if (raw.op === 'Exclude') {
    if (!isPlainObject(raw.exclude)) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'exclude_required' }
    }
    const ex = raw.exclude
    if (ex.by !== 'ordinal' && ex.by !== 'place_contains') {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_exclude_by' }
    }
    if (ex.by === 'ordinal') {
      if (typeof ex.ordinal !== 'number' || !Number.isFinite(ex.ordinal)) {
        return {
          ok: false,
          reason: 'VALIDATION_ERROR',
          detail: 'exclude_ordinal_required',
        }
      }
      return { op: 'Exclude', by: 'ordinal', ordinal: ex.ordinal }
    }
    if (typeof ex.place_value !== 'string' || !ex.place_value.trim()) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'exclude_place_required',
      }
    }
    return {
      op: 'Exclude',
      by: 'place_contains',
      placeValue: ex.place_value,
      placeRole:
        ex.place_role === 'preparations' ||
        ex.place_role === 'ceremony' ||
        ex.place_role === 'reception' ||
        ex.place_role === 'any'
          ? ex.place_role
          : undefined,
    }
  }
  return { ok: false, reason: 'VALIDATION_ERROR', detail: `unknown_op:${raw.op}` }
}

export function mapNativeQueryArgs(
  args: Record<string, unknown>,
): { ok: true; value: SearchAction } | NativeMapFailure {
  if (args.source !== 'wedding') {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'source_must_be_wedding' }
  }
  const temporal = mapTemporal(args.temporal)
  if (isFail(temporal)) return temporal
  const sort = mapSort(args.sort)
  if (isFail(sort)) return sort
  const slice = mapSlice(args.slice)
  if (isFail(slice)) return slice
  const excludePlace = mapPlace(args.exclude_place)
  if (isFail(excludePlace)) return excludePlace
  let filters: V6PlaceFilter[] | undefined
  if (args.filters !== null && args.filters !== undefined) {
    if (!Array.isArray(args.filters)) {
      return { ok: false, reason: 'VALIDATION_ERROR', detail: 'bad_filters' }
    }
    filters = []
    for (const f of args.filters) {
      const p = mapPlace(f)
      if (isFail(p)) return p
      if (!p) {
        return { ok: false, reason: 'VALIDATION_ERROR', detail: 'null_filter_item' }
      }
      filters.push(p)
    }
  }
  let conceptFilters: V6ConceptPredicate[] | undefined
  if (args.concept_filters !== null && args.concept_filters !== undefined) {
    if (!Array.isArray(args.concept_filters)) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'bad_concept_filters',
      }
    }
    conceptFilters = []
    for (const raw of args.concept_filters) {
      const predicate = mapConceptFilter(raw)
      if (isFail(predicate)) return predicate
      conceptFilters.push(predicate)
    }
  }
  return {
    ok: true,
    value: {
      type: 'Search',
      source: 'wedding',
      filters,
      conceptFilters,
      excludePlace: excludePlace ?? undefined,
      relativeTemporal: temporal ?? null,
      sort: sort ?? null,
      slice: slice ?? null,
    },
  }
}

export function mapNativeTransformArgs(
  args: Record<string, unknown>,
):
  | { ok: true; value: { parentHandle: string; ops: V6FilterOp[] } }
  | NativeMapFailure {
  if (typeof args.parent_handle !== 'string' || !args.parent_handle.trim()) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'parent_handle_required',
    }
  }
  if (!Array.isArray(args.ops) || args.ops.length < 1) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail: 'ops_required' }
  }
  const ops: V6FilterOp[] = []
  for (const raw of args.ops) {
    const op = mapFilterOp(raw)
    if ('ok' in op && op.ok === false) return op
    ops.push(op as V6FilterOp)
  }
  return {
    ok: true,
    value: { parentHandle: args.parent_handle.trim(), ops },
  }
}

export function mapNativeAggregateArgs(
  args: Record<string, unknown>,
): { ok: true; value: AggregateAction } | NativeMapFailure {
  if (typeof args.collection !== 'string' || !args.collection.trim()) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'collection_required',
    }
  }
  if (args.aggregation !== 'count' && args.aggregation !== 'sum') {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'bad_aggregation',
    }
  }
  if (args.aggregation === 'sum') {
    if (
      typeof args.measure !== 'string' ||
      !resolveAggregateConcept(args.measure)
    ) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: 'sum_requires_measure',
      }
    }
  } else if (args.measure !== null && args.measure !== undefined) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'count_measure_must_be_null',
    }
  }
  return {
    ok: true,
    value: {
      type: 'Aggregate',
      collection: args.collection.trim(),
      aggregation: args.aggregation,
      measure:
        args.aggregation === 'sum'
          ? (args.measure as AggregateAction['measure'])
          : null,
    },
  }
}

export function mapNativeRestoreArgs(
  args: Record<string, unknown>,
): { ok: true; value: RestoreAction } | NativeMapFailure {
  if (typeof args.collection !== 'string' || !args.collection.trim()) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'collection_required',
    }
  }
  return {
    ok: true,
    value: { type: 'Restore', collection: args.collection.trim() },
  }
}

/** Forbidden legacy/invented keys that must never appear on native path. */
export const FORBIDDEN_NATIVE_ARG_KEYS = [
  'metric',
  'operation',
  'operations',
  'handle',
  'search',
  'offset', // top-level temporal offset invention
] as const

export function assertNoInventedVocabulary(
  args: Record<string, unknown>,
): NativeMapFailure | null {
  for (const k of FORBIDDEN_NATIVE_ARG_KEYS) {
    if (k in args) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR',
        detail: `invented_argument_key:${k}`,
      }
    }
  }
  // nested temporal offset
  if (isPlainObject(args.temporal) && 'offset' in args.temporal) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'invented_argument_key:temporal.offset',
    }
  }
  return null
}

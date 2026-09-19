/**
 * V6-F1 — Apply compositional ops to money rows.
 * Fail closed on unresolved temporal. No silent drop of sort/exclude/slice.
 */

import {
  locationQueryMatchesHaystack,
  type CollectionLocationRole,
} from '../../v4/capabilities/collection/locationMatch'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import {
  dateMatchesBound,
  resolveRelativeTemporal,
} from '../semantics/temporal'
import type {
  V6FilterOp,
  V6PlaceFilter,
  V6RelativeTemporal,
  V6Slice,
  V6Sort,
} from '../semantics/types'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import {
  evaluateConceptPredicates,
  getConceptSortValue,
  V6_CROSS_DOMAIN_CANDIDATE_CAP,
} from '../adapters'
import {
  CONCEPT_TO_MONEY_MEASURE,
  isConceptKey,
  resolveSortConcept,
} from '../registry'

export type ApplyOpsResult =
  | { ok: true; rows: CollectionMoneyRow[]; sort: V6Sort | null }
  | { ok: false; code: 'UNSUPPORTED_CAPABILITY' | 'VALIDATION_ERROR'; detail: string }

function matchesPlace(
  row: CollectionMoneyRow,
  place: V6PlaceFilter,
): boolean {
  const role = place.role ?? 'any'
  if (role !== 'any') {
    const roleHay =
      row.locationByRole?.[role as Exclude<CollectionLocationRole, 'any'>] ??
      []
    if (roleHay.length > 0) {
      return locationQueryMatchesHaystack(place.value, roleHay)
    }
  }
  if (row.locationHaystack?.length) {
    return locationQueryMatchesHaystack(place.value, row.locationHaystack)
  }
  return false
}

function applyTemporal(
  rows: CollectionMoneyRow[],
  temporal: V6RelativeTemporal,
  todayKey: string,
): ApplyOpsResult {
  const bound = resolveRelativeTemporal(temporal, todayKey)
  if (bound.kind === 'unresolved') {
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: `temporal_unresolved:${bound.reason}`,
    }
  }
  return {
    ok: true,
    rows: rows.filter((r) => dateMatchesBound(r.date, bound)),
    sort: null,
  }
}

function sortRows(rows: CollectionMoneyRow[], sort: V6Sort): CollectionMoneyRow[] {
  const out = [...rows]
  out.sort((a, b) => {
    if (sort.field === 'wedding.date') {
      const cmp = (a.date ?? '').localeCompare(b.date ?? '')
      return sort.direction === 'asc' ? cmp : -cmp
    }
    const av =
      sort.field === 'contract_value'
        ? a.contractValue
        : sort.field === 'paid_amount'
          ? a.paidAmount
          : a.remainingAmount
    const bv =
      sort.field === 'contract_value'
        ? b.contractValue
        : sort.field === 'paid_amount'
          ? b.paidAmount
          : b.remainingAmount
    const d = av - bv
    return sort.direction === 'asc' ? d : -d
  })
  return out
}

async function sortRowsAsync(
  rows: CollectionMoneyRow[],
  sort: V6Sort,
): Promise<ApplyOpsResult> {
  const concept = resolveSortConcept(sort.field)
  if (!concept) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: `sort_concept_unsupported:${sort.field}`,
    }
  }
  const legacy =
    concept === 'WEDDING.DATE'
      ? 'wedding.date'
      : CONCEPT_TO_MONEY_MEASURE[
          concept as keyof typeof CONCEPT_TO_MONEY_MEASURE
        ]
  if (legacy) {
    return {
      ok: true,
      rows: sortRows(rows, { ...sort, field: legacy }),
      sort,
    }
  }
  if (rows.length > V6_CROSS_DOMAIN_CANDIDATE_CAP) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: `CANDIDATE_CAP_EXCEEDED:candidate_count:${rows.length}`,
    }
  }
  try {
    const entries = await Promise.all(
      rows.map(async (row, index) => ({
        row,
        index,
        value: await getConceptSortValue(row.id, concept),
      })),
    )
    entries.sort((a, b) => {
      if (a.value == null && b.value == null) return a.index - b.index
      if (a.value == null) return 1
      if (b.value == null) return -1
      const cmp =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), 'pl-PL')
      return (sort.direction === 'asc' ? cmp : -cmp) || a.index - b.index
    })
    return { ok: true, rows: entries.map((entry) => entry.row), sort }
  } catch {
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: `sort_concept_failed:${concept}`,
    }
  }
}

function applySlice(
  rows: CollectionMoneyRow[],
  slice: V6Slice,
): ApplyOpsResult {
  if (!Number.isInteger(slice.limit) || slice.limit < 1 || slice.limit > 40) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      detail: 'slice_limit_invalid',
    }
  }
  const offset = slice.offset ?? 0
  if (!Number.isInteger(offset) || offset < 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      detail: 'slice_offset_invalid',
    }
  }
  return { ok: true, rows: rows.slice(offset, offset + slice.limit), sort: null }
}

/**
 * Apply a sequence of transform ops. Sort applies to current set before slice/exclude ordinal.
 */
export function applyTransformOps(
  rows: CollectionMoneyRow[],
  ops: readonly V6FilterOp[],
  todayKey: string = localCalendarDateKey(),
): ApplyOpsResult {
  let current = [...rows]
  let currentSort: V6Sort | null = null

  for (const op of ops) {
    if (op.op === 'Filter') {
      current = current.filter((r) => matchesPlace(r, op.place))
      continue
    }
    if (op.op === 'RelativeTemporal') {
      const r = applyTemporal(current, op.temporal, todayKey)
      if (!r.ok) return r
      current = r.rows
      continue
    }
    if (op.op === 'Sort') {
      current = sortRows(current, op.sort)
      currentSort = op.sort
      continue
    }
    if (op.op === 'Slice') {
      const r = applySlice(current, op.slice)
      if (!r.ok) return r
      current = r.rows
      continue
    }
    if (op.op === 'Exclude') {
      if (op.by === 'ordinal') {
        if (
          op.ordinal == null ||
          !Number.isInteger(op.ordinal) ||
          op.ordinal < 1
        ) {
          return {
            ok: false,
            code: 'VALIDATION_ERROR',
            detail: 'exclude_ordinal_invalid',
          }
        }
        const idx = op.ordinal - 1
        if (idx >= current.length) {
          return {
            ok: false,
            code: 'VALIDATION_ERROR',
            detail: 'exclude_ordinal_out_of_range',
          }
        }
        current = current.filter((_, i) => i !== idx)
        continue
      }
      if (op.by === 'place_contains') {
        if (!op.placeValue?.trim()) {
          return {
            ok: false,
            code: 'VALIDATION_ERROR',
            detail: 'exclude_place_missing',
          }
        }
        const place: V6PlaceFilter = {
          field: 'place.name',
          op: 'contains',
          value: op.placeValue.trim(),
          role: op.placeRole ?? 'any',
        }
        current = current.filter((r) => !matchesPlace(r, place))
        continue
      }
      return {
        ok: false,
        code: 'UNSUPPORTED_CAPABILITY',
        detail: 'exclude_by_unsupported',
      }
    }
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: 'unknown_op',
    }
  }

  return { ok: true, rows: current, sort: currentSort }
}

export function applySearchPlan(
  universe: CollectionMoneyRow[],
  input: {
    filters?: V6PlaceFilter[]
    excludePlace?: V6PlaceFilter
    relativeTemporal?: V6RelativeTemporal | null
    sort?: V6Sort | null
    slice?: V6Slice | null
  },
  todayKey: string = localCalendarDateKey(),
): ApplyOpsResult {
  const ops: V6FilterOp[] = []
  if (input.relativeTemporal) {
    ops.push({ op: 'RelativeTemporal', temporal: input.relativeTemporal })
  }
  for (const f of input.filters ?? []) {
    ops.push({ op: 'Filter', place: f })
  }
  if (input.excludePlace) {
    ops.push({
      op: 'Exclude',
      by: 'place_contains',
      placeValue: input.excludePlace.value,
      placeRole: input.excludePlace.role ?? 'any',
    })
  }
  if (input.sort) {
    ops.push({ op: 'Sort', sort: input.sort })
  }
  if (input.slice) {
    ops.push({ op: 'Slice', slice: input.slice })
  }
  return applyTransformOps(universe, ops, todayKey)
}

/**
 * Registry-backed async execution path. Concept filters are applied exactly
 * where they appear, preserving order and candidate bounds.
 */
export async function applyTransformOpsAsync(
  rows: CollectionMoneyRow[],
  ops: readonly V6FilterOp[],
  todayKey: string = localCalendarDateKey(),
): Promise<ApplyOpsResult> {
  let current = [...rows]
  let currentSort: V6Sort | null = null
  for (const op of ops) {
    if (op.op === 'ConceptFilter') {
      if (
        current.length > V6_CROSS_DOMAIN_CANDIDATE_CAP ||
        !isConceptKey(op.predicate.concept)
      ) {
        return {
          ok: false,
          code: 'UNSUPPORTED_CAPABILITY',
          detail:
            current.length > V6_CROSS_DOMAIN_CANDIDATE_CAP
              ? `CANDIDATE_CAP_EXCEEDED:candidate_count:${current.length}`
              : `unknown_concept:${op.predicate.concept}`,
        }
      }
      const evaluated = await evaluateConceptPredicates(
        current.map((row) => row.id),
        [{ ...op.predicate, concept: op.predicate.concept }],
      )
      if (!evaluated.ok) {
        return {
          ok: false,
          code: 'UNSUPPORTED_CAPABILITY',
          detail: `${evaluated.code}:${evaluated.detail}`,
        }
      }
      const matched = new Set(evaluated.matchedIds)
      current = current.filter((row) => matched.has(row.id))
      continue
    }
    if (op.op === 'Sort') {
      const sorted = await sortRowsAsync(current, op.sort)
      if (!sorted.ok) return sorted
      current = sorted.rows
      currentSort = op.sort
      continue
    }
    const applied = applyTransformOps(current, [op], todayKey)
    if (!applied.ok) return applied
    current = applied.rows
  }
  return { ok: true, rows: current, sort: currentSort }
}

export async function applySearchPlanAsync(
  universe: CollectionMoneyRow[],
  input: {
    filters?: V6PlaceFilter[]
    conceptFilters?: import('../semantics/types').V6ConceptPredicate[]
    excludePlace?: V6PlaceFilter
    relativeTemporal?: V6RelativeTemporal | null
    sort?: V6Sort | null
    slice?: V6Slice | null
  },
  todayKey: string = localCalendarDateKey(),
): Promise<ApplyOpsResult> {
  const cheapOps: V6FilterOp[] = []
  if (input.relativeTemporal) {
    cheapOps.push({ op: 'RelativeTemporal', temporal: input.relativeTemporal })
  }
  for (const place of input.filters ?? []) cheapOps.push({ op: 'Filter', place })
  if (input.excludePlace) {
    cheapOps.push({
      op: 'Exclude',
      by: 'place_contains',
      placeValue: input.excludePlace.value,
      placeRole: input.excludePlace.role ?? 'any',
    })
  }
  const cheap = applyTransformOps(universe, cheapOps, todayKey)
  if (!cheap.ok) return cheap

  let rows = cheap.rows
  const predicates = input.conceptFilters ?? []
  if (predicates.length) {
    if (
      rows.length > V6_CROSS_DOMAIN_CANDIDATE_CAP ||
      predicates.some((predicate) => !isConceptKey(predicate.concept))
    ) {
      return {
        ok: false,
        code: 'UNSUPPORTED_CAPABILITY',
        detail:
          rows.length > V6_CROSS_DOMAIN_CANDIDATE_CAP
            ? `CANDIDATE_CAP_EXCEEDED:candidate_count:${rows.length}`
            : 'unknown_concept_filter',
      }
    }
    const evaluated = await evaluateConceptPredicates(
      rows.map((row) => row.id),
      predicates as Array<
        Omit<(typeof predicates)[number], 'concept'> & {
          concept: import('../registry').ConceptKey
        }
      >,
    )
    if (!evaluated.ok) {
      return {
        ok: false,
        code: 'UNSUPPORTED_CAPABILITY',
        detail: `${evaluated.code}:${evaluated.detail}`,
      }
    }
    const matched = new Set(evaluated.matchedIds)
    rows = rows.filter((row) => matched.has(row.id))
  }

  const finishingOps: V6FilterOp[] = []
  if (input.sort) finishingOps.push({ op: 'Sort', sort: input.sort })
  if (input.slice) finishingOps.push({ op: 'Slice', slice: input.slice })
  return applyTransformOpsAsync(rows, finishingOps, todayKey)
}

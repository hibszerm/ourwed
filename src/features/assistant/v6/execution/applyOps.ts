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

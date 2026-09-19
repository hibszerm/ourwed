/**
 * V6-F1.1 — Semantic judges for live Luna traces (no phrase routers).
 */

import type { V6LiveExpect } from './v6LiveCorpus'

export type ToolTraceEntry = {
  round: number
  name: string
  args: Record<string, unknown>
  ok: boolean
  code?: string
  result?: unknown
  inputHandle?: string
  outputHandle?: string
  latencyMs: number
}

export type TurnTrace = {
  utterance: string
  agentStatuses: string[]
  toolTrace: ToolTraceEntry[]
  modelLatencyMs: number[]
  finalStatus: string
  unsupportedReason?: string
  activeHandleAfter?: string | null
  snapshotAfter?: string[]
  parentSnapshot?: string[]
  financeProvenance?: string | null
  observability?: {
    modelDecisionCount: number
    executedToolCount: number
    duplicateToolAttemptCount: number
    duplicateToolExecutionCount: number
    repairCount: number
    terminationReason: string | null
    unsupportedReason: string | null
    requestedOperationClasses: string[]
    executedOperationClasses: string[]
  }
  classification:
    | 'PASS'
    | 'INTERPRETATION_ERROR'
    | 'REFERENCE_RESOLUTION_ERROR'
    | 'PLAN_ERROR'
    | 'UNSUPPORTED_CAPABILITY'
    | 'OTHER_TYPED_FAILURE'
    | 'PROVIDER_ERROR'
    | 'SCHEMA_ERROR'
  failures: string[]
}

function deepFind(obj: unknown, pred: (k: string, v: unknown) => boolean): boolean {
  if (!obj || typeof obj !== 'object') return false
  if (Array.isArray(obj)) return obj.some((x) => deepFind(x, pred))
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (pred(k, v)) return true
    if (deepFind(v, pred)) return true
  }
  return false
}

function hasFutureFromNow(args: Record<string, unknown>): boolean {
  return deepFind(args, (_k, v) => {
    if (!v || typeof v !== 'object') return false
    const o = v as Record<string, unknown>
    return o.kind === 'future_from_now'
  })
}

function hasSortDateAsc(args: Record<string, unknown>): boolean {
  return deepFind(args, (k, v) => {
    if (k === 'sort' && v && typeof v === 'object') {
      const s = v as Record<string, unknown>
      return s.field === 'wedding.date' && s.direction === 'asc'
    }
    if (k === 'ops' && Array.isArray(v)) {
      return v.some(
        (op) =>
          op &&
          typeof op === 'object' &&
          (op as { op?: string }).op === 'Sort' &&
          (op as { sort?: { field?: string; direction?: string } }).sort
            ?.field === 'wedding.date' &&
          (op as { sort?: { direction?: string } }).sort?.direction === 'asc',
      )
    }
    return false
  })
}

function hasSlice(args: Record<string, unknown>, min?: number): boolean {
  return deepFind(args, (k, v) => {
    if (k === 'slice' && v && typeof v === 'object') {
      const lim = (v as { limit?: number }).limit
      if (typeof lim !== 'number') return false
      return min == null ? lim >= 1 : lim === min || lim >= min
    }
    if (k === 'ops' && Array.isArray(v)) {
      return v.some((op) => {
        if (!op || typeof op !== 'object') return false
        if ((op as { op?: string }).op !== 'Slice') return false
        const lim = (op as { slice?: { limit?: number } }).slice?.limit
        if (typeof lim !== 'number') return false
        return min == null ? lim >= 1 : lim === min || lim >= min
      })
    }
    return false
  })
}

function hasClosedYear(args: Record<string, unknown>, year: number): boolean {
  return deepFind(args, (_k, v) => {
    if (!v || typeof v !== 'object') return false
    const o = v as Record<string, unknown>
    return o.kind === 'closed_calendar_year' && o.year === year
  })
}

function hasClosedMonth(
  args: Record<string, unknown>,
  year: number,
  month: number,
): boolean {
  return deepFind(args, (_k, v) => {
    if (!v || typeof v !== 'object') return false
    const o = v as Record<string, unknown>
    return (
      o.kind === 'closed_calendar_month' &&
      o.year === year &&
      o.month === month
    )
  })
}

function hasPlaceContains(args: Record<string, unknown>, needle: string): boolean {
  const n = needle.toLowerCase()
  return deepFind(args, (_k, v) => {
    if (typeof v === 'string' && v.toLowerCase().includes(n)) return true
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.value === 'string' && o.value.toLowerCase().includes(n)) {
        return true
      }
      if (
        typeof o.placeValue === 'string' &&
        o.placeValue.toLowerCase().includes(n)
      ) {
        return true
      }
    }
    return false
  })
}

function hasPlaceExclude(args: Record<string, unknown>, needle: string): boolean {
  const n = needle.toLowerCase()
  return deepFind(args, (k, v) => {
    if (k === 'excludePlace' && v && typeof v === 'object') {
      const val = (v as { value?: string }).value
      return typeof val === 'string' && val.toLowerCase().includes(n)
    }
    if (k === 'ops' && Array.isArray(v)) {
      return v.some((op) => {
        if (!op || typeof op !== 'object') return false
        const o = op as {
          op?: string
          by?: string
          placeValue?: string
        }
        return (
          o.op === 'Exclude' &&
          o.by === 'place_contains' &&
          typeof o.placeValue === 'string' &&
          o.placeValue.toLowerCase().includes(n)
        )
      })
    }
    return false
  })
}

function allArgs(trace: ToolTraceEntry[]): Record<string, unknown>[] {
  return trace.map((t) => t.args)
}

export function judgeTurn(input: {
  expect: V6LiveExpect
  turn: TurnTrace
  hadPriorCollection: boolean
}): TurnTrace {
  const failures = [...input.turn.failures]
  const expect = input.expect
  const tools = input.turn.toolTrace
  const names = tools.map((t) => t.name)
  const argsList = allArgs(tools)

  const anyArgsMatch = (fn: (a: Record<string, unknown>) => boolean) =>
    argsList.some(fn)

  if (input.turn.classification === 'PROVIDER_ERROR' || input.turn.classification === 'SCHEMA_ERROR') {
    return input.turn
  }

  // Clarification is an allowed outcome when the case permits it — do not
  // grade missing tool semantics on a clarify turn.
  if (expect.allowClarify && input.turn.finalStatus === 'clarify') {
    return { ...input.turn, classification: 'PASS', failures: [] }
  }

  if (expect.requireUnsupported) {
    const unsupported =
      input.turn.finalStatus === 'unsupported' ||
      input.turn.agentStatuses.includes('unsupported')
    const fabricated =
      names.includes('query_collection') ||
      names.includes('aggregate_collection') ||
      names.includes('transform_collection')
    if (unsupported && !fabricated) {
      return {
        ...input.turn,
        classification: 'PASS',
        failures: [],
      }
    }
    if (fabricated) {
      failures.push('unsupported_fabricated_support')
      return {
        ...input.turn,
        classification: 'INTERPRETATION_ERROR',
        failures,
      }
    }
    if (expect.allowClarify && input.turn.finalStatus === 'clarify') {
      return { ...input.turn, classification: 'PASS', failures: [] }
    }
    failures.push('expected_unsupported')
    return {
      ...input.turn,
      classification: 'INTERPRETATION_ERROR',
      failures,
    }
  }

  if (expect.requireFutureFromNow && !anyArgsMatch(hasFutureFromNow)) {
    // Silent substitution: year instead of from-now
    if (anyArgsMatch((a) => hasClosedYear(a, 2027) || hasClosedYear(a, 2026))) {
      failures.push('silent_substitution_year_for_nearest')
    } else {
      failures.push('missing_future_from_now')
    }
  }
  if (expect.requireSortDateAsc && !anyArgsMatch(hasSortDateAsc)) {
    failures.push('dropped_sort_date_asc')
  }
  if (expect.requireSlice && !anyArgsMatch((a) => hasSlice(a, expect.minSlice))) {
    failures.push('dropped_or_wrong_slice')
  }
  if (
    expect.requireClosedYear != null &&
    !anyArgsMatch((a) => hasClosedYear(a, expect.requireClosedYear!))
  ) {
    failures.push(`missing_closed_year_${expect.requireClosedYear}`)
  }
  if (expect.requireClosedMonth) {
    const { year, month } = expect.requireClosedMonth
    if (!anyArgsMatch((a) => hasClosedMonth(a, year, month))) {
      failures.push(`missing_closed_month_${year}_${month}`)
    }
  }
  if (
    expect.requirePlaceContains &&
    !anyArgsMatch((a) => hasPlaceContains(a, expect.requirePlaceContains!))
  ) {
    failures.push('missing_place_filter')
  }
  if (
    expect.requirePlaceExclude &&
    !anyArgsMatch((a) => hasPlaceExclude(a, expect.requirePlaceExclude!))
  ) {
    failures.push('missing_place_exclude')
  }

  if (expect.requireAggregate) {
    const agg = tools.find((t) => t.name === 'aggregate_collection')
    if (!agg) {
      failures.push('missing_aggregate')
    } else {
      const a = agg.args.aggregation
      if (a !== expect.requireAggregate) failures.push('wrong_aggregation')
      if (
        expect.requireMeasure &&
        agg.args.measure !== expect.requireMeasure
      ) {
        failures.push('wrong_or_changed_measure')
      }
      if (
        agg.ok &&
        agg.result &&
        typeof agg.result === 'object' &&
        'data' in (agg.result as object)
      ) {
        const data = (agg.result as { data?: { provenance?: string } }).data
        if (
          expect.requireAggregate === 'sum' &&
          data?.provenance !== 'canonical_finance'
        ) {
          failures.push('finance_provenance_violation')
        }
      }
    }
  }

  if (expect.requireTransformNotRootSearch && input.hadPriorCollection) {
    const hasTransform = names.includes('transform_collection')
    const hasRoot = names.includes('query_collection')
    const hasAggregateOnPrior =
      names.includes('aggregate_collection') &&
      tools.some(
        (t) =>
          t.name === 'aggregate_collection' &&
          (typeof t.inputHandle === 'string' ||
            typeof t.args.collection === 'string'),
      )
    const hasRestore = names.includes('restore_collection')
    // Refine OR operate on prior handle (aggregate/restore) — not a fresh root.
    const keepsPrior = hasTransform || hasAggregateOnPrior || hasRestore
    if (hasRoot && !hasTransform) {
      failures.push('collection_context_loss_root_search')
    } else if (!keepsPrior && !expect.allowClarify) {
      // clarify on "pokaż je" for empty might be ok
      if (input.turn.finalStatus !== 'clarify') {
        failures.push('expected_transform_on_prior')
      }
    }
  }

  if (expect.requireRestore) {
    if (!names.includes('restore_collection')) {
      // Some models re-activate via transform no-op — still fail restore expectation
      if (input.turn.finalStatus !== 'clarify') {
        failures.push('missing_restore')
      }
    }
  }

  // Subset invariant if we have snapshots
  if (
    input.turn.parentSnapshot &&
    input.turn.snapshotAfter &&
    input.turn.toolTrace.some((t) => t.name === 'transform_collection' && t.ok)
  ) {
    const parent = new Set(input.turn.parentSnapshot)
    const ok = input.turn.snapshotAfter.every((id) => parent.has(id))
    if (!ok) failures.push('subset_invariant_broken')
  }

  if (
    failures.includes('silent_substitution_year_for_nearest') ||
    failures.includes('dropped_sort_date_asc') ||
    failures.includes('dropped_or_wrong_slice') ||
    failures.includes('wrong_or_changed_measure') ||
    failures.includes('missing_place_exclude')
  ) {
    return {
      ...input.turn,
      classification: 'INTERPRETATION_ERROR',
      failures,
    }
  }
  if (failures.includes('collection_context_loss_root_search')) {
    return {
      ...input.turn,
      classification: 'REFERENCE_RESOLUTION_ERROR',
      failures,
    }
  }
  if (failures.includes('finance_provenance_violation')) {
    return {
      ...input.turn,
      classification: 'OTHER_TYPED_FAILURE',
      failures,
    }
  }
  if (failures.includes('subset_invariant_broken')) {
    return {
      ...input.turn,
      classification: 'OTHER_TYPED_FAILURE',
      failures,
    }
  }

  if (failures.length && expect.allowClarify && input.turn.finalStatus === 'clarify') {
    return { ...input.turn, classification: 'PASS', failures: [] }
  }

  if (failures.length) {
    return {
      ...input.turn,
      classification: 'INTERPRETATION_ERROR',
      failures,
    }
  }

  return { ...input.turn, classification: 'PASS', failures: [] }
}

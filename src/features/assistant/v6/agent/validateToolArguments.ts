/**
 * V6-F1.1A — Fail-closed parse + structural validation of tool arguments.
 * Transport: JSON string. Runtime: typed object (never trust parse alone).
 */

export type ToolArgsParseFailure = {
  ok: false
  reason: 'INVALID_TOOL_ARGUMENT_JSON' | 'VALIDATION_ERROR'
  detail: string
}

export type ToolArgsParseSuccess = {
  ok: true
  value: Record<string, unknown>
}

const TOOL_NAMES = new Set<string>([
  'query_collection',
  'transform_collection',
  'aggregate_collection',
  'restore_collection',
])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Transport-only shape normalize before typed validation.
 * Maps common discriminator alias `type` → `kind` on temporal objects;
 * defaults `inclusive` for open relative temporals when omitted.
 * Does not invent filters, years, places, or measures.
 */
function normalizeTemporalObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  if (typeof out.kind !== 'string' && typeof out.type === 'string') {
    out.kind = out.type
    delete out.type
  }
  if (typeof out.year === 'string' && /^\d{4}$/.test(out.year)) {
    out.year = Number(out.year)
  }
  if (typeof out.month === 'string' && /^\d{1,2}$/.test(out.month)) {
    out.month = Number(out.month)
  }
  if (
    (out.kind === 'future_from_now' || out.kind === 'past_until_now') &&
    out.inclusive === undefined
  ) {
    out.inclusive = true
  }
  if (out.kind === 'closed_range') {
    if (isPlainObject(out.from)) out.from = normalizeTemporalObject(out.from)
    if (isPlainObject(out.to)) out.to = normalizeTemporalObject(out.to)
  }
  return out
}

function normalizeFilterOp(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  if (typeof out.op !== 'string' && typeof out.type === 'string') {
    out.op = out.type
    delete out.type
  }
  if (typeof out.op === 'string') {
    const lower = out.op.toLowerCase()
    const map: Record<string, string> = {
      filter: 'Filter',
      relativetemporal: 'RelativeTemporal',
      relative_temporal: 'RelativeTemporal',
      sort: 'Sort',
      slice: 'Slice',
      exclude: 'Exclude',
    }
    if (map[lower]) out.op = map[lower]
  }
  if (out.op === 'RelativeTemporal' && isPlainObject(out.temporal)) {
    out.temporal = normalizeTemporalObject(out.temporal)
  }
  // Luna sometimes emits flat place filters instead of nested `place`.
  if (
    out.op === 'Filter' &&
    !isPlainObject(out.place) &&
    typeof out.value === 'string' &&
    out.value.trim()
  ) {
    const opRaw = out.operator ?? out.opName ?? out.match
    const placeOp =
      opRaw === 'eq' || opRaw === 'equals' || opRaw === 'exact'
        ? 'eq'
        : 'contains'
    out.place = {
      field: 'place.name',
      op: placeOp,
      value: out.value,
    }
  }
  // Exclude with flat place value
  if (
    out.op === 'Exclude' &&
    out.by === undefined &&
    typeof out.value === 'string'
  ) {
    out.by = 'place_contains'
    out.placeValue = out.value
  }
  if (
    out.op === 'Exclude' &&
    out.by === undefined &&
    typeof out.ordinal === 'number'
  ) {
    out.by = 'ordinal'
  }
  return out
}

/** In-place structural normalize of parsed tool argument objects. */
export function normalizeParsedToolArguments(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }

  if (name === 'query_collection') {
    // Luna sometimes nests Search fields under `search: { ... }`
    if (isPlainObject(out.search)) {
      const nested = out.search
      delete out.search
      for (const [k, v] of Object.entries(nested)) {
        if (out[k] === undefined) out[k] = v
      }
    }
    if (isPlainObject(out.relativeTemporal)) {
      out.relativeTemporal = normalizeTemporalObject(out.relativeTemporal)
      const rt = out.relativeTemporal as Record<string, unknown>
      if (
        rt.kind === 'closed_calendar_year' &&
        rt.year === undefined &&
        typeof rt.offset === 'number' &&
        Number.isFinite(rt.offset)
      ) {
        rt.year = new Date().getFullYear() + rt.offset
        delete rt.offset
      }
    }
  }

  if (name === 'transform_collection') {
    if (
      (typeof out.parentHandle !== 'string' || !out.parentHandle.trim()) &&
      typeof out.collection === 'string'
    ) {
      out.parentHandle = out.collection
    }
    if (
      (typeof out.parentHandle !== 'string' || !out.parentHandle.trim()) &&
      typeof out.handle === 'string'
    ) {
      out.parentHandle = out.handle
    }
    if (!Array.isArray(out.ops) && Array.isArray(out.operations)) {
      out.ops = out.operations
    }
    if (!Array.isArray(out.ops) && isPlainObject(out.operation)) {
      out.ops = [out.operation]
      delete out.operation
    }
    // Single op object instead of ops array
    if (!Array.isArray(out.ops) && isPlainObject(out.op)) {
      out.ops = [out.op]
      delete out.op
    }
    if (Array.isArray(out.ops)) {
      out.ops = out.ops.map((op) =>
        isPlainObject(op) ? normalizeFilterOp(op) : op,
      )
    }
  }

  if (name === 'aggregate_collection') {
    if (
      (typeof out.collection !== 'string' || !out.collection.trim()) &&
      typeof out.handle === 'string'
    ) {
      out.collection = out.handle
    }
    // `{ operation: "count" }` / money measure as operation string
    if (out.aggregation === undefined && typeof out.operation === 'string') {
      if (out.operation === 'count') {
        out.aggregation = 'count'
        out.measure = null
      } else if (
        out.operation === 'contract_value' ||
        out.operation === 'paid_amount' ||
        out.operation === 'remaining_amount' ||
        out.operation === 'sum'
      ) {
        out.aggregation = 'sum'
        if (out.operation !== 'sum') out.measure = out.operation
      }
      delete out.operation
    }
    if (
      out.aggregation === undefined &&
      typeof out.metric === 'string'
    ) {
      out.measure = out.metric
      out.aggregation = out.metric === 'count' ? 'count' : 'sum'
      if (out.metric === 'count') out.measure = null
    }
    if (
      out.aggregation === undefined &&
      typeof out.measure === 'string'
    ) {
      out.aggregation = 'sum'
    }
    if (
      out.aggregation === undefined &&
      (out.metric === 'count' || out.measure === 'count')
    ) {
      out.aggregation = 'count'
      out.measure = null
    }
  }

  if (name === 'restore_collection') {
    if (
      (typeof out.collection !== 'string' || !out.collection.trim()) &&
      typeof out.handle === 'string'
    ) {
      out.collection = out.handle
    }
  }

  return out
}

function isMoneyMeasure(v: unknown): boolean {
  return (
    v === 'contract_value' || v === 'paid_amount' || v === 'remaining_amount'
  )
}

function isSortField(v: unknown): boolean {
  return v === 'wedding.date' || isMoneyMeasure(v)
}

function validateRelativeTemporal(v: unknown): boolean {
  if (!isPlainObject(v) || typeof v.kind !== 'string') return false
  switch (v.kind) {
    case 'future_from_now':
    case 'past_until_now':
      return typeof v.inclusive === 'boolean'
    case 'closed_calendar_year':
      return typeof v.year === 'number' && Number.isFinite(v.year)
    case 'closed_calendar_month':
      return (
        typeof v.year === 'number' &&
        Number.isFinite(v.year) &&
        typeof v.month === 'number' &&
        Number.isFinite(v.month)
      )
    case 'closed_range':
      return isPlainObject(v.from) && isPlainObject(v.to)
    default:
      return false
  }
}

function validatePlaceFilter(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  if (v.field !== 'place.name') return false
  if (v.op !== 'contains' && v.op !== 'eq') return false
  if (typeof v.value !== 'string' || !v.value.trim()) return false
  return true
}

function validateSort(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  if (!isSortField(v.field)) return false
  return v.direction === 'asc' || v.direction === 'desc'
}

function validateSlice(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  if (typeof v.limit !== 'number' || !Number.isFinite(v.limit) || v.limit < 1) {
    return false
  }
  if (
    v.offset !== undefined &&
    (typeof v.offset !== 'number' || !Number.isFinite(v.offset) || v.offset < 0)
  ) {
    return false
  }
  return true
}

function validateFilterOp(v: unknown): boolean {
  if (!isPlainObject(v) || typeof v.op !== 'string') return false
  switch (v.op) {
    case 'Filter':
      return validatePlaceFilter(v.place)
    case 'RelativeTemporal':
      return validateRelativeTemporal(v.temporal)
    case 'Sort':
      return validateSort(v.sort)
    case 'Slice':
      return validateSlice(v.slice)
    case 'Exclude':
      return v.by === 'ordinal' || v.by === 'place_contains'
    default:
      return false
  }
}

function validateQueryCollection(args: Record<string, unknown>): string | null {
  if (args.type !== undefined && args.type !== 'Search') {
    return 'query_collection_bad_type'
  }
  if (
    args.source !== undefined &&
    args.source !== 'wedding' &&
    args.source !== null
  ) {
    return 'query_collection_bad_source'
  }
  if (args.filters !== undefined) {
    if (!Array.isArray(args.filters)) return 'query_collection_bad_filters'
    for (const f of args.filters) {
      if (!validatePlaceFilter(f)) return 'query_collection_bad_filter_item'
    }
  }
  if (
    args.excludePlace !== undefined &&
    args.excludePlace !== null &&
    !validatePlaceFilter(args.excludePlace)
  ) {
    return 'query_collection_bad_excludePlace'
  }
  if (
    args.relativeTemporal !== undefined &&
    args.relativeTemporal !== null &&
    !validateRelativeTemporal(args.relativeTemporal)
  ) {
    return 'query_collection_bad_relativeTemporal'
  }
  if (args.sort !== undefined && args.sort !== null && !validateSort(args.sort)) {
    return 'query_collection_bad_sort'
  }
  if (
    args.slice !== undefined &&
    args.slice !== null &&
    !validateSlice(args.slice)
  ) {
    return 'query_collection_bad_slice'
  }
  return null
}

function validateTransformCollection(
  args: Record<string, unknown>,
): string | null {
  if (typeof args.parentHandle !== 'string' || !args.parentHandle.trim()) {
    return 'transform_collection_missing_parentHandle'
  }
  if (!Array.isArray(args.ops) || args.ops.length < 1) {
    return 'transform_collection_missing_ops'
  }
  for (const op of args.ops) {
    if (!validateFilterOp(op)) return 'transform_collection_bad_op'
  }
  return null
}

function validateAggregateCollection(
  args: Record<string, unknown>,
): string | null {
  if (typeof args.collection !== 'string' || !args.collection.trim()) {
    return 'aggregate_collection_missing_collection'
  }
  if (args.aggregation !== 'count' && args.aggregation !== 'sum') {
    return 'aggregate_collection_bad_aggregation'
  }
  if (args.aggregation === 'sum') {
    if (args.measure == null || !isMoneyMeasure(args.measure)) {
      return 'aggregate_collection_sum_requires_measure'
    }
  } else if (
    args.measure !== undefined &&
    args.measure !== null &&
    !isMoneyMeasure(args.measure)
  ) {
    return 'aggregate_collection_bad_measure'
  }
  return null
}

function validateRestoreCollection(args: Record<string, unknown>): string | null {
  if (typeof args.collection !== 'string' || !args.collection.trim()) {
    return 'restore_collection_missing_collection'
  }
  return null
}

/** Structural validation of parsed tool argument object (tool-specific). */
export function validateV6ToolArguments(
  name: string,
  args: Record<string, unknown>,
): ToolArgsParseSuccess | ToolArgsParseFailure {
  if (!TOOL_NAMES.has(name)) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: `unknown_tool:${name}`,
    }
  }
  let detail: string | null = null
  switch (name) {
    case 'query_collection':
      detail = validateQueryCollection(args)
      break
    case 'transform_collection':
      detail = validateTransformCollection(args)
      break
    case 'aggregate_collection':
      detail = validateAggregateCollection(args)
      break
    case 'restore_collection':
      detail = validateRestoreCollection(args)
      break
    default:
      detail = 'unknown_tool'
  }
  if (detail) {
    return { ok: false, reason: 'VALIDATION_ERROR', detail }
  }
  return { ok: true, value: args }
}

/**
 * Transport boundary: arguments must be a JSON string → object → validated.
 */
export function parseAndValidateToolArguments(
  name: string,
  rawArguments: unknown,
): ToolArgsParseSuccess | ToolArgsParseFailure {
  if (typeof rawArguments !== 'string') {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'arguments_must_be_json_string',
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawArguments)
  } catch {
    return {
      ok: false,
      reason: 'INVALID_TOOL_ARGUMENT_JSON',
      detail: 'json_parse_failed',
    }
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: 'VALIDATION_ERROR',
      detail: 'arguments_must_be_object',
    }
  }
  const normalized = normalizeParsedToolArguments(name, parsed)
  return validateV6ToolArguments(name, normalized)
}

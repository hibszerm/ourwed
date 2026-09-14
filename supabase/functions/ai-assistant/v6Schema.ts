/**
 * V6-F1.1A — Edge agent step schema + parser (OpenAI strict:true).
 * Mirror of client schema: arguments are JSON strings → parsed + validated objects.
 */

export const ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'toolCalls', 'text', 'slot', 'reason', 'candidates'],
  properties: {
    status: {
      type: 'string',
      enum: ['tool_calls', 'final', 'clarify', 'unsupported'],
    },
    toolCalls: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'arguments'],
        properties: {
          id: { type: 'string' },
          name: {
            type: 'string',
            enum: [
              'query_collection',
              'transform_collection',
              'aggregate_collection',
              'restore_collection',
            ],
          },
          arguments: { type: 'string' },
        },
      },
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
} as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

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

function normalizeParsedToolArguments(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }

  if (name === 'query_collection') {
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
    if (out.aggregation === undefined && typeof out.operation === 'string') {
      if (out.operation === 'count') {
        out.aggregation = 'count'
        out.measure = null
      } else if (
        out.operation === 'contract_value' ||
        out.operation === 'paid_amount' ||
        out.operation === 'remaining_amount'
      ) {
        out.aggregation = 'sum'
        out.measure = out.operation
      }
      delete out.operation
    }
    if (out.aggregation === undefined && typeof out.metric === 'string') {
      if (out.metric === 'count') {
        out.aggregation = 'count'
        out.measure = null
      } else {
        out.measure = out.metric
        out.aggregation = 'sum'
      }
    }
    if (out.aggregation === undefined && typeof out.measure === 'string') {
      out.aggregation = out.measure === 'count' ? 'count' : 'sum'
      if (out.measure === 'count') out.measure = null
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
        typeof v.month === 'number' &&
        Number.isFinite(v.year) &&
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
  return (
    v.field === 'place.name' &&
    (v.op === 'contains' || v.op === 'eq') &&
    typeof v.value === 'string' &&
    !!v.value.trim()
  )
}

function validateSort(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  const fieldOk =
    v.field === 'wedding.date' ||
    v.field === 'contract_value' ||
    v.field === 'paid_amount' ||
    v.field === 'remaining_amount'
  return fieldOk && (v.direction === 'asc' || v.direction === 'desc')
}

function validateSlice(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  if (typeof v.limit !== 'number' || !Number.isFinite(v.limit) || v.limit < 1) {
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

function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): string | null {
  if (name === 'query_collection') {
    if (args.type !== undefined && args.type !== 'Search') {
      return 'VALIDATION_ERROR:query_collection_bad_type'
    }
    if (
      args.relativeTemporal != null &&
      !validateRelativeTemporal(args.relativeTemporal)
    ) {
      return 'VALIDATION_ERROR:query_collection_bad_relativeTemporal'
    }
    if (args.sort != null && !validateSort(args.sort)) {
      return 'VALIDATION_ERROR:query_collection_bad_sort'
    }
    if (args.slice != null && !validateSlice(args.slice)) {
      return 'VALIDATION_ERROR:query_collection_bad_slice'
    }
    if (args.filters !== undefined) {
      if (!Array.isArray(args.filters)) {
        return 'VALIDATION_ERROR:query_collection_bad_filters'
      }
      for (const f of args.filters) {
        if (!validatePlaceFilter(f)) {
          return 'VALIDATION_ERROR:query_collection_bad_filter_item'
        }
      }
    }
    if (args.excludePlace != null && !validatePlaceFilter(args.excludePlace)) {
      return 'VALIDATION_ERROR:query_collection_bad_excludePlace'
    }
    return null
  }
  if (name === 'transform_collection') {
    if (typeof args.parentHandle !== 'string' || !args.parentHandle.trim()) {
      return 'VALIDATION_ERROR:transform_collection_missing_parentHandle'
    }
    if (!Array.isArray(args.ops) || args.ops.length < 1) {
      return 'VALIDATION_ERROR:transform_collection_missing_ops'
    }
    for (const op of args.ops) {
      if (!validateFilterOp(op)) {
        return 'VALIDATION_ERROR:transform_collection_bad_op'
      }
    }
    return null
  }
  if (name === 'aggregate_collection') {
    if (typeof args.collection !== 'string' || !args.collection.trim()) {
      return 'VALIDATION_ERROR:aggregate_collection_missing_collection'
    }
    if (args.aggregation !== 'count' && args.aggregation !== 'sum') {
      return 'VALIDATION_ERROR:aggregate_collection_bad_aggregation'
    }
    if (
      args.aggregation === 'sum' &&
      (args.measure == null || !isMoneyMeasure(args.measure))
    ) {
      return 'VALIDATION_ERROR:aggregate_collection_sum_requires_measure'
    }
    return null
  }
  if (name === 'restore_collection') {
    if (typeof args.collection !== 'string' || !args.collection.trim()) {
      return 'VALIDATION_ERROR:restore_collection_missing_collection'
    }
    return null
  }
  return 'VALIDATION_ERROR:unknown_tool'
}

function parseToolArguments(
  name: string,
  raw: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: string } {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'VALIDATION_ERROR:arguments_must_be_json_string' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'INVALID_TOOL_ARGUMENT_JSON:json_parse_failed' }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'VALIDATION_ERROR:arguments_must_be_object' }
  }
  const normalized = normalizeParsedToolArguments(name, parsed)
  const err = validateToolArgs(name, normalized)
  if (err) return { ok: false, reason: err }
  return { ok: true, value: normalized }
}

export function parseV6AgentStepPayload(raw: unknown):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_object' }
  }
  const row = raw as Record<string, unknown>
  const status = row.status
  if (
    status !== 'tool_calls' &&
    status !== 'final' &&
    status !== 'clarify' &&
    status !== 'unsupported'
  ) {
    return { ok: false, reason: 'bad_status' }
  }

  if (status === 'tool_calls') {
    if (!Array.isArray(row.toolCalls) || row.toolCalls.length < 1) {
      return { ok: false, reason: 'tool_calls_required' }
    }
    const toolCalls: Array<{
      id: string
      name: string
      arguments: Record<string, unknown>
    }> = []
    for (const c of row.toolCalls) {
      if (!c || typeof c !== 'object') return { ok: false, reason: 'bad_call' }
      const call = c as Record<string, unknown>
      if (typeof call.id !== 'string' || typeof call.name !== 'string') {
        return { ok: false, reason: 'bad_call_fields' }
      }
      const args = parseToolArguments(call.name, call.arguments)
      if (!args.ok) return { ok: false, reason: args.reason }
      toolCalls.push({
        id: call.id,
        name: call.name,
        arguments: args.value,
      })
    }
    return {
      ok: true,
      value: {
        status,
        toolCalls,
        text: null,
        slot: null,
        reason: null,
        candidates: null,
      },
    }
  }

  if (status === 'clarify') {
    const reasonFromText =
      typeof row.text === 'string' && row.text.trim() ? row.text : null
    const reason =
      typeof row.reason === 'string' && row.reason.trim()
        ? row.reason
        : reasonFromText
    if (!reason) {
      return { ok: false, reason: 'clarify_incomplete' }
    }
    const slot =
      typeof row.slot === 'string' && row.slot.trim()
        ? row.slot
        : 'unspecified'
    return {
      ok: true,
      value: {
        status,
        toolCalls: null,
        text: typeof row.text === 'string' ? row.text : null,
        slot,
        reason,
        candidates: Array.isArray(row.candidates) ? row.candidates : null,
      },
    }
  }

  if (status === 'unsupported') {
    if (typeof row.reason !== 'string') {
      return { ok: false, reason: 'unsupported_incomplete' }
    }
    return {
      ok: true,
      value: {
        status,
        toolCalls: null,
        text: null,
        slot: null,
        reason: row.reason,
        candidates: null,
      },
    }
  }

  // final
  return {
    ok: true,
    value: {
      status,
      toolCalls: null,
      text: typeof row.text === 'string' ? row.text : null,
      slot: null,
      reason: null,
      candidates: null,
    },
  }
}

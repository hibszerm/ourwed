/**
 * V6 — Deterministic TurnPlan capability gate (runtime authority).
 * No LLM. No NL inference. Validates execution primitives against frozen F1.4 registry.
 *
 * KNOWN_CORRECTION_COLLECTION_BASE_GAP_H20: correction≠snapshot refine is a separate
 * planner/collection issue — not solved here.
 */
import {
  ALL_RELATION_KEYS,
  getConcept,
  isConceptKey,
  resolveAggregateConcept,
  resolveSortConcept,
  type RelationKey,
} from '../registry'

export type V6TurnPlanCapabilityVerdict = 'SUPPORTED' | 'UNSUPPORTED'

export type V6TurnPlanCapabilityResult = {
  verdict: V6TurnPlanCapabilityVerdict
  code: string
  detail: string
}

const STEP_KINDS = new Set([
  'SEARCH_COLLECTION',
  'TRANSFORM_COLLECTION',
  'AGGREGATE_COLLECTION',
  'RESTORE_COLLECTION',
  'INSPECT_WEDDING',
  'INSPECT_RESOURCE',
  'LIST_RELATED',
])

const DETAIL_SELECTORS = new Set([
  'ceremony_place',
  'ceremony_address',
  'reception_place',
  'reception_address',
  'bride_preparation_place',
  'bride_preparation_address',
  'groom_preparation_place',
  'groom_preparation_address',
])

const AGGS = new Set(['count', 'sum'])
const TEMPORAL_KINDS = new Set([
  'future_from_now',
  'past_until_now',
  'closed_range',
  'closed_calendar_year',
  'closed_calendar_month',
])
const TRANSFORM_OPS = new Set([
  'Filter',
  'Exclude',
  'Sort',
  'Slice',
  'RelativeTemporal',
  'ConceptFilter',
])
const PLACE_OPS = new Set(['contains', 'eq'])

function fail(code: string, detail: string): V6TurnPlanCapabilityResult {
  return { verdict: 'UNSUPPORTED', code, detail }
}

function ok(code = 'all_primitives_supported'): V6TurnPlanCapabilityResult {
  return { verdict: 'SUPPORTED', code, detail: 'all_listed_primitives_supported' }
}

function checkPlace(p: unknown, ctx: string): V6TurnPlanCapabilityResult | null {
  if (!p || typeof p !== 'object') return fail('bad_place_filter', ctx)
  const r = p as Record<string, unknown>
  if (r.field !== 'place.name') {
    return fail('unsupported_place_field', `${ctx}:${String(r.field)}`)
  }
  if (typeof r.op !== 'string' || !PLACE_OPS.has(r.op)) {
    return fail('unsupported_place_op', `${ctx}:${String(r.op)}`)
  }
  if (typeof r.value !== 'string' || !r.value.trim()) {
    return fail('bad_place_value', ctx)
  }
  return null
}

function checkTemporal(t: unknown, ctx: string): V6TurnPlanCapabilityResult | null {
  if (!t || typeof t !== 'object') return fail('bad_temporal', ctx)
  const r = t as Record<string, unknown>
  const kind = r.kind
  if (typeof kind !== 'string' || !TEMPORAL_KINDS.has(kind)) {
    return fail('unsupported_temporal_kind', `${ctx}:${String(kind)}`)
  }
  if (kind === 'closed_calendar_year') {
    if (typeof r.year !== 'number' || !Number.isFinite(r.year)) {
      return fail('closed_calendar_year_requires_year', ctx)
    }
  }
  if (kind === 'closed_calendar_month') {
    if (typeof r.year !== 'number' || !Number.isFinite(r.year)) {
      return fail('closed_calendar_month_requires_year', ctx)
    }
    if (
      typeof r.month !== 'number' ||
      !Number.isFinite(r.month) ||
      r.month < 1 ||
      r.month > 12
    ) {
      return fail('closed_calendar_month_requires_month', ctx)
    }
  }
  return null
}

function checkSort(s: unknown, ctx: string): V6TurnPlanCapabilityResult | null {
  if (!s || typeof s !== 'object') return fail('bad_sort', ctx)
  const r = s as Record<string, unknown>
  if (typeof r.field !== 'string' || !resolveSortConcept(r.field)) {
    return fail('unsupported_sort_field', `${ctx}:${String(r.field)}`)
  }
  if (r.direction !== 'asc' && r.direction !== 'desc') {
    return fail('bad_sort_direction', ctx)
  }
  return null
}

function checkConceptPredicate(
  predicate: unknown,
  ctx: string,
): V6TurnPlanCapabilityResult | null {
  if (!predicate || typeof predicate !== 'object') {
    return fail('bad_concept_filter', ctx)
  }
  const r = predicate as Record<string, unknown>
  if (!isConceptKey(r.concept)) {
    return fail('unknown_concept', `${ctx}:${String(r.concept)}`)
  }
  const concept = getConcept(r.concept)
  if (
    !(concept.operations as readonly string[]).includes('filter') ||
    concept.costClass === 'expensive' ||
    !('filterShape' in concept)
  ) {
    return fail('concept_not_filterable', `${ctx}:${r.concept}`)
  }
  const filterShape = concept.filterShape
  const shapes = Array.isArray(filterShape) ? filterShape : [filterShape]
  if (
    typeof r.cmp !== 'string' ||
    !(shapes as readonly unknown[]).includes(r.cmp)
  ) {
    return fail('unsupported_concept_cmp', `${ctx}:${String(r.cmp)}`)
  }
  if (
    r.value !== null &&
    typeof r.value !== 'boolean' &&
    typeof r.value !== 'number' &&
    typeof r.value !== 'string'
  ) {
    return fail('bad_concept_value', ctx)
  }
  return null
}

function checkSlice(s: unknown, ctx: string): V6TurnPlanCapabilityResult | null {
  if (!s || typeof s !== 'object') return fail('bad_slice', ctx)
  const limit = (s as { limit?: unknown }).limit
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    return fail('bad_slice_limit', ctx)
  }
  return null
}

function checkSearch(search: unknown): V6TurnPlanCapabilityResult | null {
  if (!search || typeof search !== 'object') return fail('bad_search', 'search')
  const s = search as Record<string, unknown>
  if (s.source !== 'wedding') return fail('unsupported_source', String(s.source))
  if (s.relativeTemporal != null) {
    const e = checkTemporal(s.relativeTemporal, 'search.temporal')
    if (e) return e
  }
  if (s.sort != null) {
    const e = checkSort(s.sort, 'search.sort')
    if (e) return e
  }
  if (s.slice != null) {
    const e = checkSlice(s.slice, 'search.slice')
    if (e) return e
  }
  if (s.excludePlace != null) {
    const e = checkPlace(s.excludePlace, 'search.excludePlace')
    if (e) return e
  }
  if (Array.isArray(s.filters)) {
    for (let i = 0; i < s.filters.length; i++) {
      const e = checkPlace(s.filters[i], `search.filters[${i}]`)
      if (e) return e
    }
  }
  if (Array.isArray(s.conceptFilters)) {
    for (let i = 0; i < s.conceptFilters.length; i++) {
      const e = checkConceptPredicate(
        s.conceptFilters[i],
        `search.conceptFilters[${i}]`,
      )
      if (e) return e
    }
  }
  return null
}

function checkTransformOp(op: unknown, idx: number): V6TurnPlanCapabilityResult | null {
  if (!op || typeof op !== 'object') return fail('bad_transform_op', `ops[${idx}]`)
  const r = op as Record<string, unknown>
  const name = r.op
  if (typeof name !== 'string' || !TRANSFORM_OPS.has(name)) {
    return fail('unsupported_transform_op', `ops[${idx}]:${String(name)}`)
  }
  if (name === 'Filter') return checkPlace(r.place, `ops[${idx}].place`)
  if (name === 'ConceptFilter') {
    return checkConceptPredicate(r.predicate, `ops[${idx}].predicate`)
  }
  if (name === 'RelativeTemporal') {
    return checkTemporal(r.temporal, `ops[${idx}].temporal`)
  }
  if (name === 'Sort') return checkSort(r.sort, `ops[${idx}].sort`)
  if (name === 'Slice') return checkSlice(r.slice, `ops[${idx}].slice`)
  if (name === 'Exclude') {
    const by = r.by
    if (by !== 'ordinal' && by !== 'place_contains') {
      return fail('unsupported_exclude_by', `ops[${idx}]:${String(by)}`)
    }
    return null
  }
  return null
}

/**
 * Validate Draft TurnPlan execution primitives only.
 * output.kind=UNSUPPORTED → UNSUPPORTED (plan declares non-executable request).
 */
export function checkTurnPlanCapability(
  draftPlan: unknown,
): V6TurnPlanCapabilityResult {
  if (!draftPlan || typeof draftPlan !== 'object') {
    return fail('bad_plan', 'not_object')
  }
  const plan = draftPlan as { steps?: unknown; output?: { kind?: unknown } }
  const outKind = plan.output?.kind
  if (outKind === 'UNSUPPORTED') {
    return {
      verdict: 'UNSUPPORTED',
      code: 'plan_declares_unsupported',
      detail: 'output.kind=UNSUPPORTED',
    }
  }
  if (
    outKind !== 'COLLECTION' &&
    outKind !== 'AGGREGATE' &&
    outKind !== 'CLARIFICATION' &&
    outKind !== 'DETAIL'
  ) {
    return fail('unsupported_output_kind', String(outKind))
  }
  if (outKind === 'CLARIFICATION') {
    return ok('clarification_terminal')
  }
  if (!Array.isArray(plan.steps)) return fail('bad_steps', 'steps_not_array')

  for (const step of plan.steps) {
    if (!step || typeof step !== 'object') return fail('bad_step', 'step_not_object')
    const st = step as Record<string, unknown>
    const kind = st.kind
    if (typeof kind !== 'string' || !STEP_KINDS.has(kind)) {
      return fail('unsupported_step_kind', String(kind))
    }
    if (kind === 'SEARCH_COLLECTION') {
      const e = checkSearch(st.search)
      if (e) return e
    } else if (kind === 'TRANSFORM_COLLECTION') {
      if (!Array.isArray(st.ops)) return fail('bad_transform_ops', String(st.id))
      for (let i = 0; i < st.ops.length; i++) {
        const e = checkTransformOp(st.ops[i], i)
        if (e) return e
      }
    } else if (kind === 'AGGREGATE_COLLECTION') {
      if (typeof st.aggregation !== 'string' || !AGGS.has(st.aggregation)) {
        return fail('unsupported_aggregation', String(st.aggregation))
      }
      if (st.aggregation === 'sum') {
        const concept =
          typeof st.measure === 'string'
            ? resolveAggregateConcept(st.measure)
            : null
        if (
          !concept ||
          !(getConcept(concept).operations as readonly string[]).includes(
            'aggregate_sum',
          )
        ) {
          return fail('unsupported_measure', String(st.measure))
        }
      }
    } else if (kind === 'RESTORE_COLLECTION') {
      if (typeof st.inputHandle !== 'string' || !st.inputHandle.trim()) {
        return fail('bad_restore_handle', String(st.id))
      }
    } else if (kind === 'INSPECT_WEDDING') {
      if (
        typeof st.detailSelector !== 'string' ||
        !DETAIL_SELECTORS.has(st.detailSelector)
      ) {
        return fail('unsupported_detail_selector', String(st.detailSelector))
      }
    } else if (kind === 'INSPECT_RESOURCE') {
      if (
        !Array.isArray(st.concepts) ||
        st.concepts.length < 1 ||
        st.concepts.length > 6
      ) {
        return fail('bad_inspect_concepts', String(st.id))
      }
      for (const concept of st.concepts) {
        if (
          !isConceptKey(concept) ||
          !(getConcept(concept).operations as readonly string[]).includes(
            'inspect',
          )
        ) {
          return fail('concept_not_inspectable', String(concept))
        }
      }
    } else if (kind === 'LIST_RELATED') {
      if (
        typeof st.relation !== 'string' ||
        !ALL_RELATION_KEYS.includes(st.relation as RelationKey)
      ) {
        return fail('unsupported_relation', String(st.relation))
      }
    }
  }
  return ok()
}

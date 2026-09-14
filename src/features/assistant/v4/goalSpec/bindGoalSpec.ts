/**
 * G7 — Context Binder: GoalSpec + conversation semantic context → BoundGoal.
 *
 * Responsibility: "What does this turn mean in the current conversation?"
 * Does NOT compile DomainQuery. Does NOT parse utterances.
 * Does NOT mutate the input GoalSpec (S2 ownership: GoalSpec stays
 * interpreter/current-turn intent; BoundGoal holds resolved effective semantics).
 *
 * Precedence:
 *   CURRENT EXPLICIT GOALSPEC SLOT
 *   > ACTIVE DOMAINQUERY CONTEXT
 *   > PAGE / RESOURCE CONTEXT
 *   > MISSING → NeedsClarification (no guessing)
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import { extractInheritedSemanticsFromDomainQuery } from '../domainQuery/extractInheritedSemantics'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type { BoundGoal, BoundPlaceRelation } from './boundGoal'
import type {
  BindGoalSpecResult,
  BinderNeedsClarification,
  GoalBinderContext,
} from './binderTypes'
import type {
  GoalRelationConstraint,
  GoalSpec,
  NamedEntityRef,
} from './goalSpec'
import { resolveCollectionSource } from './resolveCollectionSource'

type BoundAggregation = 'count' | 'list' | 'sum'

/**
 * Map DomainQuery.aggregate → GoalSpec aggregation for inheritance.
 * DomainQuery list uses aggregate=null.
 * Unsupported/rank-like aggregates are not inherited into the G7 slice.
 */
function mapDomainQueryAggregate(
  aggregate: DomainQuery['aggregate'] | undefined,
): BoundAggregation | null {
  if (aggregate === 'count') return 'count'
  if (aggregate === 'sum') return 'sum'
  if (aggregate === null) return 'list'
  return null
}

/**
 * Typed-only: continuation / correction delta that may inherit aggregation.
 * Explicit measure without aggregation is a new money operation — incomplete,
 * not a filter-only delta (do not inherit count; do not infer sum).
 */
function isAggregationInheritanceCompatible(goal: GoalSpec): boolean {
  const flagged =
    goal.inheritance?.fromActiveCollection === true ||
    goal.dialogue === 'inherit' ||
    goal.dialogue === 'correct'
  if (!flagged) return false
  if (goal.aggregation != null) return false
  if (goal.measure != null) return false
  return true
}

function resolveAggregation(
  goal: GoalSpec,
  activeQuery: DomainQuery | null | undefined,
):
  | { status: 'ok'; aggregation: BoundAggregation }
  | { status: 'missing'; reason: string }
  | { status: 'unsupported'; reason: string } {
  const explicit = goal.aggregation
  if (
    explicit === 'avg' ||
    explicit === 'rank' ||
    explicit === 'group' ||
    explicit === 'min' ||
    explicit === 'max'
  ) {
    return {
      status: 'unsupported',
      reason: `aggregate_${explicit}_not_in_g7_slice`,
    }
  }
  if (explicit === 'count' || explicit === 'list' || explicit === 'sum') {
    return { status: 'ok', aggregation: explicit }
  }

  // aggregation == null
  if (isAggregationInheritanceCompatible(goal)) {
    const mapped = mapDomainQueryAggregate(activeQuery?.aggregate)
    if (mapped) return { status: 'ok', aggregation: mapped }
    return {
      status: 'missing',
      reason: 'aggregation_missing_no_active_aggregate',
    }
  }

  // Explicit measure + null aggregation: interpreter must supply sum (etc.)
  if (goal.measure != null) {
    return {
      status: 'missing',
      reason: 'aggregation_missing_for_measure',
    }
  }

  return { status: 'missing', reason: 'aggregation_missing' }
}

function clarification(
  partial: Omit<BinderNeedsClarification, 'preservedContext'> & {
    preservedQuery?: DomainQuery | null
  },
): BindGoalSpecResult {
  return {
    status: 'needs_clarification',
    clarification: {
      reason: partial.reason,
      missingSlots: partial.missingSlots,
      ambiguousSlots: partial.ambiguousSlots,
      choices: partial.choices,
      preservedContext: {
        activeCollectionQuery: partial.preservedQuery ?? null,
      },
    },
  }
}

function placeNameFromRelation(
  rel: GoalRelationConstraint,
): string | null {
  if (rel.field !== 'place.name' && rel.field !== null) return null
  if (rel.relation !== 'place' && rel.relation !== 'unknown') return null
  const v = rel.value
  if (typeof v === 'string' && v.trim().length >= 2) return v.trim()
  if (v && typeof v === 'object' && 'text' in v) {
    const ref = v as NamedEntityRef
    return ref.text.trim().length >= 2 ? ref.text.trim() : null
  }
  return null
}

function placeRoleFromRelation(
  rel: GoalRelationConstraint,
): 'preparations' | 'ceremony' | 'reception' | null {
  if (rel.field === 'place.role') {
    if (
      rel.value === 'preparations' ||
      rel.value === 'ceremony' ||
      rel.value === 'reception'
    ) {
      return rel.value
    }
  }
  if (rel.field === 'place.name' && rel.value && typeof rel.value === 'object') {
    const ref = rel.value as NamedEntityRef
    if (
      ref.roleHint === 'preparations' ||
      ref.roleHint === 'ceremony' ||
      ref.roleHint === 'reception'
    ) {
      return ref.roleHint
    }
  }
  return null
}

function explicitPlaceFromGoal(goal: GoalSpec): {
  name: string | null
  role: 'preparations' | 'ceremony' | 'reception' | null
  entityKindAmbiguous: boolean
  ambiguousKinds?: Array<'package' | 'extra' | string>
} {
  let name: string | null = null
  let role: 'preparations' | 'ceremony' | 'reception' | null = null
  let entityKindAmbiguous = false
  let ambiguousKinds: Array<'package' | 'extra' | string> | undefined

  for (const rel of goal.relations) {
    if (rel.ambiguousKinds && rel.ambiguousKinds.length > 1) {
      entityKindAmbiguous = true
      ambiguousKinds = rel.ambiguousKinds
    }
    const n = placeNameFromRelation(rel)
    if (n) name = n
    const r = placeRoleFromRelation(rel)
    if (r) role = r
  }
  return { name, role, entityKindAmbiguous, ambiguousKinds }
}

function buildPlaceRelations(
  name: string | null,
  role: 'preparations' | 'ceremony' | 'reception' | 'any' | null,
): BoundPlaceRelation[] {
  const out: BoundPlaceRelation[] = []
  if (name) {
    out.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: name,
    })
  }
  if (role && role !== 'any') {
    out.push({
      relation: 'place',
      field: 'place.role',
      op: 'eq',
      value: role,
    })
  }
  return out
}

/**
 * Bind GoalSpec against DomainQuery-native conversation context.
 */
export function bindGoalSpec(
  goal: GoalSpec,
  ctx: GoalBinderContext,
): BindGoalSpecResult {
  if (goal.requestKind === 'clarification') {
    return { status: 'unsupported', reason: 'clarification_request_kind' }
  }
  if (
    goal.requestKind === 'goal_plan' ||
    goal.requestKind === 'product_help' ||
    goal.requestKind === 'prepare_action'
  ) {
    return { status: 'unsupported', reason: `request_kind_${goal.requestKind}` }
  }
  if (goal.requestKind === 'unsupported') {
    return {
      status: 'unsupported',
      reason: goal.unsupportedReason ?? 'unsupported_goal',
    }
  }

  // Propagate GoalSpec ambiguities that context cannot auto-resolve.
  // measure may still inherit from active DomainQuery — deferred below.
  for (const a of goal.ambiguities) {
    if (a.slot === 'measure') continue
    if (a.slot === 'date_dimension' || goal.temporal?.dateDimensionAmbiguous) {
      return clarification({
        reason: a.reason,
        missingSlots: [],
        ambiguousSlots: ['date_dimension'],
        choices: a.candidates,
        preservedQuery: ctx.activeCollectionQuery,
      })
    }
    if (a.slot === 'entity_kind') {
      return clarification({
        reason: a.reason,
        missingSlots: [],
        ambiguousSlots: ['entity_kind'],
        choices: a.candidates,
        preservedQuery: ctx.activeCollectionQuery,
      })
    }
    return clarification({
      reason: a.reason,
      missingSlots: a.slot === 'other' ? ['other'] : [a.slot],
      ambiguousSlots: [],
      choices: a.candidates,
      preservedQuery: ctx.activeCollectionQuery,
    })
  }

  if (goal.temporal?.dateDimensionAmbiguous) {
    return clarification({
      reason: 'date_dimension_ambiguous',
      missingSlots: [],
      ambiguousSlots: ['date_dimension'],
      preservedQuery: ctx.activeCollectionQuery,
    })
  }

  const inherited = extractInheritedSemanticsFromDomainQuery(
    ctx.activeCollectionQuery,
  )

  // --- Source (S1 Context Resolver) ---
  const sourceResolved = resolveCollectionSource(goal, {
    activeCollectionQuery: ctx.activeCollectionQuery,
    activeResource: ctx.activeResource,
    getCollectionSource: ctx.getCollectionSource,
  })

  if (sourceResolved.status === 'unsupported') {
    return { status: 'unsupported', reason: sourceResolved.reason }
  }
  if (sourceResolved.status === 'incompatible') {
    return {
      status: 'unsupported',
      reason: sourceResolved.reason,
    }
  }
  if (sourceResolved.status === 'missing') {
    return clarification({
      reason: sourceResolved.reason,
      missingSlots: ['source'],
      ambiguousSlots: [],
      preservedQuery: ctx.activeCollectionQuery,
    })
  }

  // defer_for_measure: continue; measure clarification below. Source stays unset
  // until measure patch → registry ownership on resume.
  let source: 'wedding' | null =
    sourceResolved.status === 'resolved' ? sourceResolved.source : null

  // --- Aggregation ---
  // Ownership:
  //   CURRENT EXPLICIT AGGREGATION
  //   > ACTIVE DOMAINQUERY AGGREGATION (inheritance-compatible deltas only)
  //   > MISSING → clarification
  //
  // Inheritance-compatible (typed GoalSpec only; never utterance text):
  //   dialogue inherit|correct OR inheritance.fromActiveCollection
  //   AND aggregation == null
  //   AND measure == null  (explicit measure = new money op; do NOT inherit count / infer sum)
  const aggregation = resolveAggregation(goal, ctx.activeCollectionQuery)
  if (aggregation.status === 'unsupported') {
    return { status: 'unsupported', reason: aggregation.reason }
  }
  if (aggregation.status === 'missing') {
    return clarification({
      reason: aggregation.reason,
      missingSlots: ['aggregation'],
      ambiguousSlots: [],
      preservedQuery: ctx.activeCollectionQuery,
    })
  }
  const resolvedAggregation = aggregation.aggregation

  if (goal.groupBy.length > 0) {
    return { status: 'unsupported', reason: 'groupby_not_in_g7_slice' }
  }

  // Unsupported non-place relations in G7 slice (representable in GoalSpec only)
  for (const rel of goal.relations) {
    if (
      rel.relation === 'package' ||
      rel.relation === 'extra' ||
      rel.relation === 'payment' ||
      rel.relation === 'contract'
    ) {
      return {
        status: 'unsupported',
        reason: `relation_${rel.relation}_not_in_g7_slice`,
      }
    }
    if (rel.relation === 'unknown' && rel.field && rel.field !== 'place.name') {
      // unknown ceremony.time etc.
      if (rel.field !== 'place.role') {
        return {
          status: 'unsupported',
          reason: `field_${rel.field}_not_in_g7_slice`,
        }
      }
    }
  }

  const explicitPlace = explicitPlaceFromGoal(goal)
  if (explicitPlace.entityKindAmbiguous) {
    return clarification({
      reason: 'entity_kind_ambiguous',
      missingSlots: [],
      ambiguousSlots: ['entity_kind'],
      choices: explicitPlace.ambiguousKinds?.map((id) => ({
        id,
        label: id,
      })),
      preservedQuery: ctx.activeCollectionQuery,
    })
  }

  // Place: explicit replaces inherited (no intersection / no append).
  const placeName = explicitPlace.name ?? inherited?.locationQuery ?? null
  const placeRole: 'preparations' | 'ceremony' | 'reception' | 'any' | null =
    explicitPlace.name
      ? (explicitPlace.role ?? 'any')
      : explicitPlace.role
        ? explicitPlace.role
        : (inherited?.locationRole ?? null)

  // --- Temporal ---
  // Precedence: current explicit resolvedRange > active DomainQuery date >
  // page/resource (page temporal is not inherited here; DQ is SoT).
  const explicitRange = goal.temporal?.resolvedRange ?? null
  const inheritedRange = inherited?.dateRange ?? null
  const explicitTemporalExpression =
    typeof goal.temporal?.expression === 'string' &&
    goal.temporal.expression.trim().length > 0

  // Current-turn temporal attempt that failed normalization must not
  // silently preserve an older activeDomainQuery date range.
  if (explicitTemporalExpression && !explicitRange) {
    return {
      status: 'unsupported',
      reason: 'temporal_expression_unresolved',
    }
  }

  const resolvedRange = explicitRange ?? inheritedRange

  let dateDimension: 'wedding.date' | null = null
  if (resolvedRange) {
    const explicitDim = goal.temporal?.dateDimension
    if (explicitDim && explicitDim !== 'wedding.date') {
      return {
        status: 'unsupported',
        reason: `date_dimension_${explicitDim}_not_in_g7_slice`,
      }
    }
    // G7 wedding collection slice: only wedding.date is plausible.
    dateDimension = 'wedding.date'
  }

  // --- Measure ---
  let measure: SemanticFieldId | null = goal.measure
  if (!measure && resolvedAggregation === 'sum') {
    // Inherit only when active DomainQuery has an unambiguous money measure
    measure = ctx.activeCollectionQuery?.measure ?? null
    if (
      measure &&
      measure !== 'wedding.contract_value' &&
      measure !== 'wedding.paid_amount' &&
      measure !== 'wedding.remaining_amount'
    ) {
      measure = null
    }
  }
  if (resolvedAggregation === 'sum' && !measure) {
    const hasMeasureAmbiguity = goal.ambiguities.some((a) => a.slot === 'measure')
    return clarification({
      reason: hasMeasureAmbiguity
        ? goal.ambiguities.find((a) => a.slot === 'measure')!.reason
        : 'sum_requires_measure',
      missingSlots: ['measure'],
      ambiguousSlots: [],
      choices: [
        { id: 'wedding.contract_value', label: 'contract_value' },
        { id: 'wedding.paid_amount', label: 'paid' },
        { id: 'wedding.remaining_amount', label: 'remaining' },
      ],
      preservedQuery: ctx.activeCollectionQuery,
    })
  }
  if (resolvedAggregation !== 'sum') {
    measure = null
  }

  // After measure is known, source must be resolved (registry / inherit / page).
  if (source == null) {
    const afterMeasure = resolveCollectionSource(
      { ...goal, measure, source: goal.source },
      {
        activeCollectionQuery: ctx.activeCollectionQuery,
        activeResource: ctx.activeResource,
        getCollectionSource: ctx.getCollectionSource,
      },
    )
    if (afterMeasure.status === 'resolved') {
      source = afterMeasure.source
    } else if (afterMeasure.status === 'unsupported') {
      return { status: 'unsupported', reason: afterMeasure.reason }
    } else if (afterMeasure.status === 'incompatible') {
      return { status: 'unsupported', reason: afterMeasure.reason }
    } else {
      return clarification({
        reason: 'source_missing',
        missingSlots: ['source'],
        ambiguousSlots: [],
        preservedQuery: ctx.activeCollectionQuery,
      })
    }
  }

  if (source !== 'wedding') {
    return {
      status: 'unsupported',
      reason: `source_${source}_not_in_g7_slice`,
    }
  }

  const bound: BoundGoal = {
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: resolvedAggregation,
    measure,
    temporal: {
      resolvedRange,
      dateDimension,
    },
    relations: buildPlaceRelations(placeName, placeRole),
    orderBy: [],
    groupBy: [],
    aspects: [...goal.aspects],
    targets: [...goal.targets],
  }

  return { status: 'bound', goal: bound }
}

/** Build binder context from DomainQuery SoT + optional page resource. */
export function makeGoalBinderContext(input: {
  activeCollectionQuery?: DomainQuery | null
  activeResource?: GoalBinderContext['activeResource']
  getCollectionSource?: GoalBinderContext['getCollectionSource']
}): GoalBinderContext {
  return {
    activeCollectionQuery: input.activeCollectionQuery ?? null,
    activeResource: input.activeResource ?? null,
    getCollectionSource: input.getCollectionSource,
  }
}

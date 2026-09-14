/**
 * IC2 — Interpreter semantic-shape evaluator (evaluation only).
 *
 * Checks expected semantic composition in a fixture → Luna GoalSpec shape.
 * NOT SemanticCoverage (GoalSpec → executable preservation).
 * No utterance/phrase heuristics — only typed GoalSpec structure vs typed expectation.
 */

import type { GoalSpec } from './goalSpec'

export type Ic2EvalOutcome =
  | 'COMPLETE'
  | 'INCOMPLETE_MATERIAL_SEMANTICS'
  | 'UNSUPPORTED_SAFE'
  | 'SCHEMA_ERROR'
  | 'PROVIDER_ERROR'

/** Semantic operators the fixture asserts must remain visible in GoalSpec. */
export type Ic2ShapeRequirement =
  | 'grouping'
  | 'ranking_or_order'
  | 'top_n_limit'
  | 'avg'
  | 'min'
  | 'max'
  | 'temporal_expression'
  | 'measure_contract_value'
  | 'measure_paid'
  | 'measure_remaining'
  | 'aggregation_count'
  | 'aggregation_list'
  | 'aggregation_sum'
  | 'inherit_active_collection'
  | 'dialogue_inherit'
  | 'place_relation'
  | 'package_or_extra_relation'
  | 'named_target'
  | 'request_unsupported'
  | 'request_domain_query'
  | 'measure_ambiguity'
  | 'no_concrete_measure'
  | 'not_plain_unrestricted_count'
  | 'not_plain_count_without_group_rank'
  | 'not_simplified_list_or_sum'

export type Ic2ShapeExpectation = {
  /** All listed operators must be present for COMPLETE (unless unsupported path). */
  require: Ic2ShapeRequirement[]
  /**
   * When true, requestKind=unsupported counts as UNSUPPORTED_SAFE success
   * (faithful refusal to under-specify).
   */
  allowUnsupportedSafe: boolean
}

export type Ic2ShapeAssessment = {
  outcome: Ic2EvalOutcome
  missing: Ic2ShapeRequirement[]
  notes: string[]
}

function isUnsupported(goal: GoalSpec): boolean {
  return goal.requestKind === 'unsupported'
}

function hasGrouping(goal: GoalSpec): boolean {
  return (
    goal.groupBy.length > 0 ||
    goal.aggregation === 'group' ||
    goal.aggregation === 'rank'
  )
}

function hasRankingOrOrder(goal: GoalSpec): boolean {
  return (
    goal.orderBy.length > 0 ||
    goal.aggregation === 'rank' ||
    (goal.limit != null && goal.limit > 0)
  )
}

function hasTopN(goal: GoalSpec): boolean {
  return goal.limit != null && goal.limit > 0
}

function hasTemporalExpression(goal: GoalSpec): boolean {
  const expr = goal.temporal?.expression
  return typeof expr === 'string' && expr.trim().length > 0
}

function isPlainUnrestrictedCount(goal: GoalSpec): boolean {
  return (
    goal.requestKind === 'domain_query' &&
    goal.aggregation === 'count' &&
    !hasTemporalExpression(goal) &&
    goal.groupBy.length === 0 &&
    goal.orderBy.length === 0 &&
    goal.limit == null &&
    goal.relations.length === 0 &&
    goal.targets.length === 0
  )
}

function isPlainCountWithoutGroupRank(goal: GoalSpec): boolean {
  return (
    goal.requestKind === 'domain_query' &&
    goal.aggregation === 'count' &&
    !hasGrouping(goal) &&
    !hasRankingOrOrder(goal)
  )
}

function isSimplifiedListOrSum(goal: GoalSpec): boolean {
  return (
    goal.requestKind === 'domain_query' &&
    (goal.aggregation === 'list' || goal.aggregation === 'sum') &&
    !hasGrouping(goal) &&
    !hasRankingOrOrder(goal) &&
    goal.limit == null
  )
}

function hasPlaceRelation(goal: GoalSpec): boolean {
  if (goal.relations.some((r) => r.relation === 'place')) return true
  // Flat schema may only surface place via named/place slots folded into relations by parser.
  return goal.relations.some(
    (r) =>
      typeof r.field === 'string' &&
      (r.field.includes('place') || r.field.includes('venue')),
  )
}

function hasPackageOrExtra(goal: GoalSpec): boolean {
  return goal.relations.some(
    (r) => r.relation === 'package' || r.relation === 'extra',
  )
}

function hasNamedTarget(goal: GoalSpec): boolean {
  return goal.targets.some(
    (t) => t.kind === 'named' && t.ref.text.trim().length > 0,
  )
}

function hasMeasureAmbiguity(goal: GoalSpec): boolean {
  return goal.ambiguities.some((a) => a.slot === 'measure')
}

function checkRequirement(
  goal: GoalSpec,
  req: Ic2ShapeRequirement,
): boolean {
  switch (req) {
    case 'grouping':
      return hasGrouping(goal)
    case 'ranking_or_order':
      return hasRankingOrOrder(goal)
    case 'top_n_limit':
      return hasTopN(goal)
    case 'avg':
      return goal.aggregation === 'avg'
    case 'min':
      return goal.aggregation === 'min' ||
        (goal.orderBy.some((o) => o.direction === 'asc') &&
          goal.aggregation !== 'max')
    case 'max':
      return goal.aggregation === 'max' ||
        (goal.orderBy.some((o) => o.direction === 'desc') &&
          goal.aggregation !== 'min')
    case 'temporal_expression':
      return hasTemporalExpression(goal)
    case 'measure_contract_value':
      return goal.measure === 'wedding.contract_value'
    case 'measure_paid':
      return goal.measure === 'wedding.paid_amount'
    case 'measure_remaining':
      return goal.measure === 'wedding.remaining_amount'
    case 'aggregation_count':
      return goal.aggregation === 'count'
    case 'aggregation_list':
      return goal.aggregation === 'list'
    case 'aggregation_sum':
      return goal.aggregation === 'sum'
    case 'inherit_active_collection':
      return goal.inheritance?.fromActiveCollection === true
    case 'dialogue_inherit':
      return goal.dialogue === 'inherit'
    case 'place_relation':
      return hasPlaceRelation(goal)
    case 'package_or_extra_relation':
      return hasPackageOrExtra(goal)
    case 'named_target':
      return hasNamedTarget(goal)
    case 'request_unsupported':
      return isUnsupported(goal)
    case 'request_domain_query':
      return goal.requestKind === 'domain_query'
    case 'measure_ambiguity':
      return hasMeasureAmbiguity(goal)
    case 'no_concrete_measure':
      return goal.measure == null
    case 'not_plain_unrestricted_count':
      return !isPlainUnrestrictedCount(goal)
    case 'not_plain_count_without_group_rank':
      return !isPlainCountWithoutGroupRank(goal)
    case 'not_simplified_list_or_sum':
      return !isSimplifiedListOrSum(goal)
    default: {
      const _exhaustive: never = req
      return _exhaustive
    }
  }
}

/**
 * Evaluate GoalSpec against typed semantic-shape expectation.
 * Call only when schema parse succeeded; otherwise pass SCHEMA_ERROR / PROVIDER_ERROR upstream.
 */
export function assessIc2SemanticShape(
  goal: GoalSpec,
  expectation: Ic2ShapeExpectation,
): Ic2ShapeAssessment {
  const notes: string[] = []

  if (isUnsupported(goal) && expectation.allowUnsupportedSafe) {
    return {
      outcome: 'UNSUPPORTED_SAFE',
      missing: [],
      notes: ['typed unsupported accepted for this semantic family'],
    }
  }

  if (isUnsupported(goal) && !expectation.allowUnsupportedSafe) {
    return {
      outcome: 'INCOMPLETE_MATERIAL_SEMANTICS',
      missing: expectation.require.filter((r) => r !== 'request_unsupported'),
      notes: ['unexpected unsupported for supported/simple family'],
    }
  }

  const missing = expectation.require.filter(
    (req) => !checkRequirement(goal, req),
  )

  if (missing.length > 0) {
    notes.push(`missing operators: ${missing.join(',')}`)
    return {
      outcome: 'INCOMPLETE_MATERIAL_SEMANTICS',
      missing,
      notes,
    }
  }

  return { outcome: 'COMPLETE', missing: [], notes }
}

/** True when outcome is an IC2 gate pass for the case. */
export function isIc2ShapePass(outcome: Ic2EvalOutcome): boolean {
  return outcome === 'COMPLETE' || outcome === 'UNSUPPORTED_SAFE'
}

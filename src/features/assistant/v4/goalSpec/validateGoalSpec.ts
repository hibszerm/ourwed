/**
 * V1 — Typed post-interpretation GoalSpec consistency validator (shadow only).
 *
 * Input: GoalSpec (+ optional typed binder context). NEVER raw user text.
 * Does not reinterpret language. Deterministic typed invariants only.
 *
 * Note: do not confuse with schema.ts `validateGoalSpec` (version check).
 *
 * S3B — U4.7 retired:
 * - No misclassified monetary-sum kind recovery (no unsupported/clarification → domain_query)
 * - No synthetic sum-measure ambiguity (Binder/Resolver owns sum+null measure)
 * Production/default behavior is the former thin structural/hygiene path.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type { GoalAmbiguity, GoalSpec } from './goalSpec'

export type TypedValidationIssueCode =
  | 'MISSING_REQUIRED_AMBIGUITY'
  | 'REDUNDANT_AMBIGUITY'
  | 'CONFLICTING_RESOLVED_AMBIGUITY'
  | 'SUM_REQUIRES_MEASURE'
  | 'INVALID_AGGREGATION_MEASURE_PAIR'
  | 'AMBIGUOUS_DATE_DIMENSION'
  | 'REDUNDANT_DATE_DIMENSION_AMBIGUITY'
  | 'MISSING_ENTITY_KIND_AMBIGUITY'
  | 'CONFLICTING_ENTITY_KIND_AMBIGUITY'

export type TypedValidationIssue = {
  code: TypedValidationIssueCode
  slot?: string
  detail: string
}

export type TypedCorrection = {
  code: TypedValidationIssueCode
  slot: string
  action:
    | 'removed_ambiguity'
    | 'added_ambiguity'
    | 'cleared_measure'
    | 'set_date_dimension'
    | 'cleared_date_dimension_ambiguous'
}

export type ValidateGoalSpecConsistencyResult =
  | { status: 'valid'; goal: GoalSpec }
  | {
      status: 'normalized'
      goal: GoalSpec
      corrections: TypedCorrection[]
      issues: TypedValidationIssue[]
    }
  | {
      status: 'needs_clarification'
      goal: GoalSpec
      issues: TypedValidationIssue[]
      corrections: TypedCorrection[]
    }
  | { status: 'invalid'; goal: GoalSpec; issues: TypedValidationIssue[] }

export type ValidateGoalSpecContext = {
  /** Optional active DomainQuery — typed only; never user text. */
  activeCollectionQuery?: DomainQuery | null
}

/**
 * S3/S3B — Policy seam retained for tests.
 * After U4.7 retirement, `full` and `thin` are identical (structural/hygiene only).
 * Default is the proven thin behavior.
 */
export type ValidateGoalSpecPolicy = 'full' | 'thin'

export type ValidateGoalSpecConsistencyOptions = {
  policy?: ValidateGoalSpecPolicy
}

const MONEY_MEASURES: ReadonlySet<string> = new Set([
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
])

function cloneGoal(goal: GoalSpec): GoalSpec {
  return {
    ...goal,
    targets: [...goal.targets],
    orderBy: [...goal.orderBy],
    groupBy: [...goal.groupBy],
    relations: goal.relations.map((r) => ({ ...r })),
    aspects: [...goal.aspects],
    ambiguities: goal.ambiguities.map((a) => ({ ...a })),
    correction: goal.correction ? { ...goal.correction } : null,
    inheritance: goal.inheritance ? { ...goal.inheritance } : null,
    temporal: goal.temporal
      ? {
          ...goal.temporal,
          resolvedRange: goal.temporal.resolvedRange
            ? { ...goal.temporal.resolvedRange }
            : null,
        }
      : null,
  }
}

function hasAmbiguity(goal: GoalSpec, slot: string): boolean {
  return goal.ambiguities.some((a) => a.slot === slot)
}

function removeAmbiguities(
  goal: GoalSpec,
  slot: string,
): { goal: GoalSpec; removed: boolean } {
  const next = goal.ambiguities.filter((a) => a.slot !== slot)
  if (next.length === goal.ambiguities.length) return { goal, removed: false }
  return { goal: { ...goal, ambiguities: next }, removed: true }
}

function addAmbiguity(
  goal: GoalSpec,
  amb: GoalAmbiguity,
): { goal: GoalSpec; added: boolean } {
  if (hasAmbiguity(goal, amb.slot)) return { goal, added: false }
  return {
    goal: { ...goal, ambiguities: [...goal.ambiguities, amb] },
    added: true,
  }
}

/**
 * Validate / normalize GoalSpec using typed invariants only.
 *
 * S3B: no requestKind reinterpretation; no synthetic measure ambiguity.
 * `policy` is retained for API compatibility; full ≡ thin.
 */
export function validateGoalSpecConsistency(
  input: GoalSpec,
  ctx?: ValidateGoalSpecContext,
  options?: ValidateGoalSpecConsistencyOptions,
): ValidateGoalSpecConsistencyResult {
  void ctx
  // Policy seam kept; behavior is identical post-U4.7 retirement.
  void options?.policy
  let goal = cloneGoal(input)
  const corrections: TypedCorrection[] = []
  const issues: TypedValidationIssue[] = []

  if (goal.requestKind !== 'domain_query') {
    return { status: 'valid', goal }
  }

  // 1) Resolved measure + measure ambiguity → drop ambiguity (METADATA_HYGIENE)
  if (goal.measure != null && hasAmbiguity(goal, 'measure')) {
    const r = removeAmbiguities(goal, 'measure')
    goal = r.goal
    corrections.push({
      code: 'CONFLICTING_RESOLVED_AMBIGUITY',
      slot: 'measure',
      action: 'removed_ambiguity',
    })
    issues.push({
      code: 'CONFLICTING_RESOLVED_AMBIGUITY',
      slot: 'measure',
      detail: 'measure is resolved; measure ambiguity is contradictory',
    })
  }

  // 2) count/list with money measure → clear measure (STRUCTURAL_INVARIANT)
  if (
    (goal.aggregation === 'count' || goal.aggregation === 'list') &&
    goal.measure != null &&
    MONEY_MEASURES.has(goal.measure)
  ) {
    goal = { ...goal, measure: null }
    const r = removeAmbiguities(goal, 'measure')
    goal = r.goal
    corrections.push({
      code: 'INVALID_AGGREGATION_MEASURE_PAIR',
      slot: 'measure',
      action: 'cleared_measure',
    })
    issues.push({
      code: 'INVALID_AGGREGATION_MEASURE_PAIR',
      slot: 'measure',
      detail: 'count/list does not carry monetary measure in wedding slice',
    })
  }

  // 3) sum + null measure: Binder/Resolver owns NeedsClarification(measure).
  //    Validator does NOT synthesize measure ambiguity (S3B).

  // 4) Wedding source temporal → only wedding.date is legal in current slice
  if (goal.source === 'wedding' && goal.temporal) {
    const t = goal.temporal
    const hasDateAmb =
      t.dateDimensionAmbiguous || hasAmbiguity(goal, 'date_dimension')

    if (t.dateDimension === 'wedding.date' && hasDateAmb) {
      goal = {
        ...goal,
        temporal: { ...t, dateDimensionAmbiguous: false },
      }
      const r = removeAmbiguities(goal, 'date_dimension')
      goal = r.goal
      corrections.push({
        code: 'REDUNDANT_DATE_DIMENSION_AMBIGUITY',
        slot: 'date_dimension',
        action: 'cleared_date_dimension_ambiguous',
      })
      issues.push({
        code: 'REDUNDANT_DATE_DIMENSION_AMBIGUITY',
        slot: 'date_dimension',
        detail: 'dateDimension already wedding.date; ambiguity redundant',
      })
    } else if (
      t.dateDimension == null &&
      hasDateAmb &&
      (t.expression != null || t.resolvedRange != null)
    ) {
      goal = {
        ...goal,
        temporal: {
          ...t,
          dateDimension: 'wedding.date' as SemanticFieldId,
          dateDimensionAmbiguous: false,
        },
      }
      const r = removeAmbiguities(goal, 'date_dimension')
      goal = r.goal
      corrections.push({
        code: 'AMBIGUOUS_DATE_DIMENSION',
        slot: 'date_dimension',
        action: 'set_date_dimension',
      })
      issues.push({
        code: 'AMBIGUOUS_DATE_DIMENSION',
        slot: 'date_dimension',
        detail:
          'wedding source temporal uniquely binds wedding.date in current slice',
      })
    }
  }

  // 5) Entity-kind: only align metadata when relations already declare
  // multi-kind dispute. Never invent entity_kind from surface/named text.
  // Never strip model-emitted entity_kind ambiguity (may be intentional
  // without ambiguousKinds — e.g. opaque named target).
  {
    const multiKind = goal.relations.some(
      (rel) => (rel.ambiguousKinds?.length ?? 0) > 1,
    )
    if (multiKind && !hasAmbiguity(goal, 'entity_kind')) {
      const r = addAmbiguity(goal, {
        slot: 'entity_kind',
        reason: 'entity_kind_ambiguous',
      })
      goal = r.goal
      corrections.push({
        code: 'MISSING_ENTITY_KIND_AMBIGUITY',
        slot: 'entity_kind',
        action: 'added_ambiguity',
      })
      issues.push({
        code: 'MISSING_ENTITY_KIND_AMBIGUITY',
        slot: 'entity_kind',
        detail: 'ambiguousKinds>1 requires entity_kind ambiguity metadata',
      })
    }
  }

  const needsClarification =
    (goal.aggregation === 'sum' &&
      goal.measure == null &&
      hasAmbiguity(goal, 'measure')) ||
    hasAmbiguity(goal, 'entity_kind') ||
    goal.temporal?.dateDimensionAmbiguous === true ||
    hasAmbiguity(goal, 'date_dimension')

  if (corrections.length === 0 && !needsClarification) {
    return { status: 'valid', goal }
  }

  if (needsClarification) {
    return {
      status: 'needs_clarification',
      goal,
      issues,
      corrections,
    }
  }

  if (corrections.length > 0) {
    return {
      status: 'normalized',
      goal,
      corrections,
      issues,
    }
  }

  return { status: 'valid', goal }
}

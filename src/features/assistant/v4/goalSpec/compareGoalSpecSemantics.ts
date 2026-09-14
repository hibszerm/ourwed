/**
 * G8 — Compare GoalSpec / BoundGoal / DomainQuery dimensions (no prose).
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { BoundGoal } from './boundGoal'
import type { GoalSpec } from './goalSpec'

function placeName(goal: GoalSpec): string | null {
  for (const r of goal.relations) {
    if (r.field !== 'place.name') continue
    if (typeof r.value === 'string') return r.value
    if (r.value && typeof r.value === 'object' && 'text' in r.value) {
      return (r.value as { text: string }).text
    }
  }
  return null
}

function placeRole(goal: GoalSpec): string | null {
  for (const r of goal.relations) {
    if (r.field === 'place.role' && typeof r.value === 'string') return r.value
  }
  return null
}

export function normalizeGoalSpecSemantics(goal: GoalSpec) {
  return {
    requestKind: goal.requestKind,
    dialogue: goal.dialogue,
    source: goal.source,
    aggregation: goal.aggregation,
    measure: goal.measure,
    temporalExpression: goal.temporal?.expression ?? null,
    temporalFrom: goal.temporal?.resolvedRange?.from ?? null,
    temporalTo: goal.temporal?.resolvedRange?.to ?? null,
    dateDimensionAmbiguous: goal.temporal?.dateDimensionAmbiguous ?? false,
    placeName: placeName(goal),
    placeRole: placeRole(goal),
    inheritActiveCollection: Boolean(goal.inheritance?.fromActiveCollection),
    ambiguitySlots: goal.ambiguities.map((a) => a.slot).sort(),
    correctionTarget: goal.correction?.targetSlot ?? null,
    topicKey: goal.topicKey,
  }
}

export function normalizeDomainQuerySemantics(q: DomainQuery) {
  return {
    source: q.source,
    aggregate: q.aggregate,
    measure: q.measure,
    dateFrom: q.dateBinding?.range.from ?? null,
    dateTo: q.dateBinding?.range.to ?? null,
    placeName:
      q.relations.find((r) => r.field === 'place.name')?.value ?? null,
    placeRole:
      q.relations.find((r) => r.field === 'place.role')?.value ?? null,
  }
}

export function normalizeBoundGoalSemantics(b: BoundGoal) {
  return {
    aggregation: b.aggregation,
    measure: b.measure,
    dateFrom: b.temporal.resolvedRange?.from ?? null,
    placeName:
      b.relations.find((r) => r.field === 'place.name')?.value ?? null,
    placeRole:
      b.relations.find((r) => r.field === 'place.role')?.value ?? null,
  }
}

export type GoalSpecDimScore = {
  schemaValid: boolean
  requestKind: boolean
  aggregation: boolean
  measure: boolean
  source: boolean
  temporal: boolean
  relation: boolean
  ambiguity: boolean
  correction: boolean
  ellipsis: boolean
  domainQueryAgree: boolean | null
}

/** Soft place match: Polish morphology / minor surface variance (harness only). */
function placeNameMatches(
  actual: string | null,
  expected: string | null | undefined,
): boolean {
  if (expected === undefined) return true
  if (actual === expected) return true
  if (actual == null || expected == null) return actual === expected
  const a = foldPl(actual).trim()
  const e = foldPl(expected).trim()
  if (a === e) return true
  if (a.includes(e) || e.includes(a)) return true
  const ta = a.split(/\s+/).filter(Boolean)
  const te = e.split(/\s+/).filter(Boolean)
  if (ta.length === te.length) {
    return te.every((w, i) => ta[i].startsWith(w) || w.startsWith(ta[i]))
  }
  return false
}

function correctionMatches(
  actual: string | null,
  expected: string | null | undefined,
): boolean {
  if (expected === undefined) return true
  if (actual === expected) return true
  const norm = (x: string | null) => {
    if (x == null) return null
    if (x === 'placeName' || x === 'place') return 'place'
    if (x === 'temporalExpression' || x === 'temporal' || x === 'date') {
      return 'temporal'
    }
    return x
  }
  return norm(actual) === norm(expected ?? null)
}

/** Soft ambiguity: required slots must be present; extras allowed. */
function ambiguitySlotsMatch(
  actual: string[],
  expected: string[] | undefined,
): boolean {
  if (expected === undefined) return true
  const a = new Set(actual)
  return expected.every((s) => a.has(s))
}

/** Fold Polish diacritics for soft temporal golden matching (harness only). */
function foldPl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
}

export function scoreGoalSpecAgainstExpected(
  actual: GoalSpec,
  expected: Partial<ReturnType<typeof normalizeGoalSpecSemantics>> & {
    /** Soft temporal: expression contains OR resolved from matches */
    temporalContains?: string | null
  },
): GoalSpecDimScore {
  const a = normalizeGoalSpecSemantics(actual)
  const temporalOk = expected.temporalContains
    ? Boolean(
        a.temporalExpression &&
          foldPl(a.temporalExpression).includes(
            foldPl(expected.temporalContains),
          ),
      ) ||
      (expected.temporalFrom
        ? a.temporalFrom === expected.temporalFrom
        : false) ||
      // "w tym roku" ≈ "tego" / tegoroczn*
      (foldPl(expected.temporalContains).includes('tego') &&
        Boolean(
          a.temporalExpression &&
            (foldPl(a.temporalExpression).includes('tym roku') ||
              foldPl(a.temporalExpression).includes('tego')),
        ))
    : expected.temporalExpression !== undefined
      ? a.temporalExpression === expected.temporalExpression ||
        (expected.temporalFrom != null &&
          a.temporalFrom === expected.temporalFrom)
      : expected.temporalFrom !== undefined
        ? a.temporalFrom === expected.temporalFrom
        : true

  return {
    schemaValid: true,
    requestKind:
      expected.requestKind === undefined ||
      a.requestKind === expected.requestKind,
    aggregation:
      expected.aggregation === undefined ||
      a.aggregation === expected.aggregation,
    measure:
      expected.measure === undefined || a.measure === expected.measure,
    source: expected.source === undefined || a.source === expected.source,
    temporal: temporalOk,
    relation: placeNameMatches(a.placeName, expected.placeName),
    ambiguity: ambiguitySlotsMatch(a.ambiguitySlots, expected.ambiguitySlots),
    correction: correctionMatches(a.correctionTarget, expected.correctionTarget),
    ellipsis:
      expected.inheritActiveCollection === undefined ||
      a.inheritActiveCollection === expected.inheritActiveCollection,
    domainQueryAgree: null,
  }
}

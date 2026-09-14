/**
 * G6 — Compare DomainQuery from G3 (ResolvedTask) vs GoalSpec path.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { ResolvedTask } from '../resolver/types'
import { compileResolvedSemanticsToDomainQuery } from '../domainQuery/compileResolvedSemantics'
import { adaptResolvedTaskToGoalSpec } from './adaptResolvedTaskToGoalSpec'
import { compileGoalSpecToDomainQuery } from './compileGoalSpecToDomainQuery'

function normalizeQuery(q: DomainQuery) {
  return {
    source: q.source,
    aggregate: q.aggregate,
    measure: q.measure,
    date: q.dateBinding
      ? {
          dimension: q.dateBinding.dimension,
          from: q.dateBinding.range.from,
          to: q.dateBinding.range.to,
        }
      : null,
    placeName:
      q.relations.find((r) => r.field === 'place.name')?.value ?? null,
    placeRole:
      q.relations.find((r) => r.field === 'place.role')?.value ?? null,
    limit: q.limit,
  }
}

export type GoalSpecDomainQueryAgreement = {
  agree: boolean
  reasons: string[]
  g3Status: string
  goalStatus: string
  g3Norm: ReturnType<typeof normalizeQuery> | null
  goalNorm: ReturnType<typeof normalizeQuery> | null
}

/**
 * Shadow comparison: ResolvedTask → G3 DomainQuery
 * vs ResolvedTask → GoalSpec → DomainQuery.
 */
export function compareResolvedTaskViaGoalSpec(
  resolved: ResolvedTask,
): GoalSpecDomainQueryAgreement {
  const g3 = compileResolvedSemanticsToDomainQuery(resolved)
  const goal = adaptResolvedTaskToGoalSpec(resolved)
  const via = compileGoalSpecToDomainQuery(goal)

  const reasons: string[] = []
  if (g3.status === 'success' && via.status === 'success') {
    const a = normalizeQuery(g3.query)
    const b = normalizeQuery(via.query)
    if (a.source !== b.source) reasons.push('source')
    if (a.aggregate !== b.aggregate) reasons.push('aggregate')
    if (a.measure !== b.measure) reasons.push('measure')
    if (JSON.stringify(a.date) !== JSON.stringify(b.date)) reasons.push('date')
    if (a.placeName !== b.placeName) reasons.push('place')
    if (a.placeRole !== b.placeRole) reasons.push('role')
    if (a.limit !== b.limit) reasons.push('limit')
    return {
      agree: reasons.length === 0,
      reasons,
      g3Status: 'success',
      goalStatus: 'success',
      g3Norm: a,
      goalNorm: b,
    }
  }

  // Both need slot / both unsupported with aligned reasons → agree on failure shape
  if (g3.status !== 'success' && via.status !== 'success') {
    const g3Slot =
      g3.status === 'needs_semantic_slot' ? g3.slot : g3.reason
    const viaSlot =
      via.status === 'needs_clarification' ? via.slot : via.reason
    // Soft agree when both fail (supported-slice mismatch paths)
    if (
      (g3.status === 'needs_semantic_slot' &&
        via.status === 'needs_clarification' &&
        g3.slot === 'measure' &&
        via.slot === 'measure') ||
      (g3.status === 'unsupported' && via.status === 'unsupported')
    ) {
      return {
        agree: true,
        reasons: [],
        g3Status: g3.status,
        goalStatus: via.status,
        g3Norm: null,
        goalNorm: null,
      }
    }
    reasons.push(`status:${g3.status}/${via.status}:${g3Slot}/${viaSlot}`)
    return {
      agree: false,
      reasons,
      g3Status: g3.status,
      goalStatus: via.status,
      g3Norm: null,
      goalNorm: null,
    }
  }

  reasons.push(`status_mismatch:${g3.status}/${via.status}`)
  return {
    agree: false,
    reasons,
    g3Status: g3.status,
    goalStatus: via.status,
    g3Norm: g3.status === 'success' ? normalizeQuery(g3.query) : null,
    goalNorm: via.status === 'success' ? normalizeQuery(via.query) : null,
  }
}

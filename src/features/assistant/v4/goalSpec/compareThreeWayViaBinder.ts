/**
 * G7 — Three-way DomainQuery agreement:
 * A. G5 direct ResolvedTask → DomainQuery
 * B. G6 ResolvedTask → GoalSpec → DomainQuery (no binder)
 * C. G7 ResolvedTask → GoalSpec → Binder → BoundGoal → DomainQuery
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import { compileResolvedSemanticsToDomainQuery } from '../domainQuery/compileResolvedSemantics'
import type { ResolvedTask } from '../resolver/types'
import { adaptResolvedTaskToGoalSpec } from './adaptResolvedTaskToGoalSpec'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { compileGoalSpecToDomainQuery } from './compileGoalSpecToDomainQuery'
import type { GoalBinderContext } from './binderTypes'

function normalize(q: DomainQuery) {
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

export type ThreeWayAgreement = {
  agreeAll: boolean
  reasons: string[]
  g5: string
  g6: string
  g7: string
}

/**
 * Compare G5 / G6 / G7 paths for a ResolvedTask.
 * Binder context should carry activeCollection.query when continuing a collection.
 */
export function compareThreeWayViaBinder(
  resolved: ResolvedTask,
  binderCtx?: GoalBinderContext,
): ThreeWayAgreement {
  const g5 = compileResolvedSemanticsToDomainQuery(resolved)
  const goal = adaptResolvedTaskToGoalSpec(resolved)
  const g6 = compileGoalSpecToDomainQuery(goal)

  // G7: binder uses provided context OR derives active DQ from resolved
  // collection identity when GoalSpec was adapted post-resolve (filters as
  // output slots). Prefer explicit binderCtx.
  const ctx =
    binderCtx ??
    makeGoalBinderContext({
      activeCollectionQuery: null,
      activeResource: null,
    })

  // When no conversational DQ provided, G7 binder still binds from GoalSpec
  // alone (explicit slots from adapter). That matches first-turn G5/G6.
  const bound = bindGoalSpec(goal, ctx)
  const g7 =
    bound.status === 'bound'
      ? compileBoundGoalToDomainQuery(bound.goal)
      : bound.status === 'needs_clarification'
        ? ({ status: 'needs_clarification' as const, reason: bound.clarification.reason })
        : ({ status: 'unsupported' as const, reason: bound.reason })

  const reasons: string[] = []
  const g5Ok = g5.status === 'success'
  const g6Ok = g6.status === 'success'
  const g7Ok = g7.status === 'success'

  if (g5Ok && g6Ok && g7Ok) {
    const a = normalize(g5.query)
    const b = normalize(g6.query)
    const c = normalize(g7.query)
    const keys = ['source', 'aggregate', 'measure', 'date', 'placeName', 'placeRole', 'limit'] as const
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) reasons.push(`g5≠g6:${k}`)
      if (JSON.stringify(a[k]) !== JSON.stringify(c[k])) reasons.push(`g5≠g7:${k}`)
    }
    return {
      agreeAll: reasons.length === 0,
      reasons,
      g5: 'success',
      g6: 'success',
      g7: 'success',
    }
  }

  // Aligned failure shapes
  if (!g5Ok && !g6Ok && !g7Ok) {
    return {
      agreeAll: true,
      reasons: [],
      g5: g5.status,
      g6: g6.status,
      g7: g7.status,
    }
  }

  reasons.push(`status:g5=${g5.status}/g6=${g6.status}/g7=${g7.status}`)
  return {
    agreeAll: false,
    reasons,
    g5: g5.status,
    g6: g6.status,
    g7: g7.status,
  }
}

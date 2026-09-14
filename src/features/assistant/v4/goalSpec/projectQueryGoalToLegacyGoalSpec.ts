/**
 * S4A — Project QueryGoal → Legacy GoalSpec shape for existing Binder/Resolver.
 * Shadow only. Does not run U4.7. Does not invent slots.
 */

import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import type { QueryGoal } from './goalEnvelope'

/**
 * Project QueryGoal into a domain_query GoalSpec for bindGoalSpecWithClarification.
 * Missing/ambiguous slots stay null + ambiguities — Resolver clarifies.
 */
export function projectQueryGoalToLegacyGoalSpec(query: QueryGoal): GoalSpec {
  const measureAmbiguities =
    query.measure.status === 'ambiguous'
      ? [
          {
            slot: 'measure' as const,
            reason: 'sum_requires_measure',
            candidates: (query.measure.candidates ?? []).map((id) => ({
              id,
              label: id,
            })),
          },
        ]
      : query.measure.status === 'missing' &&
          query.aggregation.status === 'resolved' &&
          query.aggregation.value === 'sum'
        ? [{ slot: 'measure' as const, reason: 'sum_requires_measure' }]
        : []

  return emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: query.dialogue,
    source:
      query.source.status === 'resolved' ? query.source.value : null,
    aggregation:
      query.aggregation.status === 'resolved'
        ? query.aggregation.value
        : null,
    measure:
      query.measure.status === 'resolved' ? query.measure.value : null,
    temporal: query.temporal
      ? {
          ...query.temporal,
          resolvedRange: query.temporal.resolvedRange
            ? { ...query.temporal.resolvedRange }
            : null,
        }
      : null,
    relations: query.relations.map((r) => ({
      ...r,
      ambiguousKinds: r.ambiguousKinds ? [...r.ambiguousKinds] : undefined,
      value:
        r.value && typeof r.value === 'object' && 'text' in r.value
          ? { ...r.value }
          : r.value,
    })),
    orderBy: query.orderBy.map((o) => ({ ...o })),
    groupBy: [...query.groupBy],
    targets: [...query.targets],
    inheritance: query.inheritance ? { ...query.inheritance } : null,
    correction: query.correction ? { ...query.correction } : null,
    ambiguities: measureAmbiguities,
  })
}

/**
 * S0 — Compact semantic slot diff for regression failures.
 */

import type { DomainQuery } from '../../domainQuery/domainQuery'
import type { BoundGoal } from '../boundGoal'
import type { SemanticSlots } from './types'

export function slotsFromBoundGoal(goal: BoundGoal): SemanticSlots {
  const place = goal.relations.find((r) => r.field === 'place.name')
  return {
    source: goal.source,
    aggregation: goal.aggregation,
    measure: goal.measure,
    dateFrom: goal.temporal.resolvedRange?.from ?? null,
    dateTo: goal.temporal.resolvedRange?.to ?? null,
    dateDimension: goal.temporal.dateDimension,
    placeName: place ? String(place.value) : null,
    operation: goal.aggregation,
  }
}

export function slotsFromDomainQuery(query: DomainQuery): SemanticSlots {
  const place = query.relations.find((r) => r.field === 'place.name')
  const operation =
    query.aggregate === 'sum'
      ? 'sum'
      : query.aggregate === 'count'
        ? 'count'
        : query.aggregate == null
          ? 'list'
          : String(query.aggregate)
  return {
    source: query.source,
    aggregate: query.aggregate,
    measure: query.measure,
    dateFrom: query.dateBinding?.range.from ?? null,
    dateTo: query.dateBinding?.range.to ?? null,
    dateDimension: query.dateBinding?.dimension ?? null,
    placeName: place ? String(place.value) : null,
    operation,
  }
}

export function formatSemanticDiff(
  caseName: string,
  expected: SemanticSlots,
  actual: SemanticSlots,
): string {
  const expLines: string[] = []
  const actLines: string[] = []
  const mismatches: string[] = []
  for (const key of [
    'source',
    'aggregation',
    'aggregate',
    'measure',
    'operation',
    'dateFrom',
    'dateTo',
    'dateDimension',
    'placeName',
  ] as const) {
    if (!(key in expected) && !(key in actual)) continue
    if (expected[key] === undefined && actual[key] === undefined) continue
    const e = expected[key] === undefined ? '—' : String(expected[key])
    const a = actual[key] === undefined ? '—' : String(actual[key])
    expLines.push(`  ${key}: ${e}`)
    actLines.push(`  ${key}: ${a}`)
    if (expected[key] !== undefined && expected[key] !== actual[key]) {
      mismatches.push(key)
    }
  }
  return [
    `CASE: ${caseName}`,
    '',
    'EXPECTED:',
    ...expLines,
    '',
    'ACTUAL:',
    ...actLines,
    mismatches.length
      ? `\nMISMATCH: ${mismatches.join(', ')}`
      : '\n(no slot mismatches)',
  ].join('\n')
}

export function assertSlotsMatch(
  caseName: string,
  expected: SemanticSlots,
  actual: SemanticSlots,
): void {
  for (const key of Object.keys(expected) as (keyof SemanticSlots)[]) {
    if (expected[key] === undefined) continue
    if (expected[key] !== actual[key]) {
      throw new Error(formatSemanticDiff(caseName, expected, actual))
    }
  }
}

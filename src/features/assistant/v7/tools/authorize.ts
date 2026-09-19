/**
 * V7 deterministic authorization helpers — registry-backed, identity-injected.
 */

import {
  ALL_RELATION_KEYS,
  getConcept,
  isConceptKey,
  type ConceptKey,
  type ConceptOperation,
  type RelationKey,
} from '../../v6/registry'
import { toolErr, type V7ToolError } from './errors'
import {
  V7_FORBIDDEN_IDENTITY_KEYS,
  type V7Predicate,
} from './types'

export function rejectIdentityInjection(
  args: Record<string, unknown> | null | undefined,
): V7ToolError | null {
  if (!args || typeof args !== 'object') return null
  for (const key of V7_FORBIDDEN_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return toolErr(
        'IDENTITY_INJECTION_REJECTED',
        'model_must_not_supply_identity',
      )
    }
  }
  // Nested scan (shallow)
  for (const value of Object.values(args)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = rejectIdentityInjection(
        value as Record<string, unknown>,
      )
      if (nested) return nested
    }
  }
  return null
}

export function resolveConceptKey(
  raw: string,
): { ok: true; key: ConceptKey } | V7ToolError {
  if (!isConceptKey(raw)) {
    return toolErr('UNKNOWN_CONCEPT', 'concept_not_in_registry', {
      concept: raw,
    })
  }
  return { ok: true, key: raw }
}

export function assertOperation(
  key: ConceptKey,
  operation: ConceptOperation,
): V7ToolError | null {
  const concept = getConcept(key)
  if (!(concept.operations as readonly string[]).includes(operation)) {
    return toolErr('OPERATION_NOT_ALLOWED', 'operation_not_allowed', {
      concept: key,
      allowedOperations: [...concept.operations],
    })
  }
  return null
}

export function assertComparator(
  key: ConceptKey,
  comparator: string,
): V7ToolError | null {
  const concept = getConcept(key)
  const opErr = assertOperation(key, 'filter')
  if (opErr) return opErr
  if (!('filterShape' in concept) || concept.filterShape == null) {
    return toolErr('COMPARATOR_NOT_ALLOWED', 'no_filter_shape', {
      concept: key,
      allowedComparators: [],
    })
  }
  const shapes = Array.isArray(concept.filterShape)
    ? concept.filterShape
    : [concept.filterShape]
  if (!(shapes as readonly string[]).includes(comparator)) {
    return toolErr('COMPARATOR_NOT_ALLOWED', 'comparator_not_allowed', {
      concept: key,
      allowedComparators: [...shapes],
    })
  }
  return null
}

export function assertAggregation(
  key: ConceptKey,
  operation: 'count' | 'sum',
): V7ToolError | null {
  if (operation === 'count') {
    // Count = exact ResourceSet membership cardinality.
    // Concept must exist (documents the resource domain); no silent substitute.
    return null
  }
  const err = assertOperation(key, 'aggregate_sum')
  if (err) {
    return toolErr('AGGREGATION_NOT_ALLOWED', 'aggregation_not_allowed', {
      concept: key,
      allowedAggregations: (getConcept(key).operations as readonly string[])
        .filter((op) => op.startsWith('aggregate_'))
        .map((op) => (op === 'aggregate_count' ? 'count' : 'sum')),
    })
  }
  return null
}

export function assertSort(key: ConceptKey): V7ToolError | null {
  const err = assertOperation(key, 'sort')
  if (err) {
    return toolErr('SORT_NOT_ALLOWED', 'sort_not_allowed', {
      concept: key,
      allowedOperations: [...getConcept(key).operations],
    })
  }
  return null
}

export function assertInspectProjection(key: ConceptKey): V7ToolError | null {
  const err = assertOperation(key, 'inspect')
  if (err) {
    return toolErr('PROJECTION_NOT_ALLOWED', 'inspect_not_allowed', {
      concept: key,
      allowedOperations: [...getConcept(key).operations],
    })
  }
  // CRA2: no SENS in registry; keep explicit block for defense-in-depth
  if ((getConcept(key).privacy as string) === 'SENS') {
    return toolErr('PRIVACY_BLOCKED', 'privacy_blocked', { concept: key })
  }
  return null
}

/** Concepts must match the ResourceSet resource (WEDDING vs SESSION). */
export function assertConceptMatchesResource(
  key: ConceptKey,
  resourceType: 'wedding' | 'session',
): V7ToolError | null {
  const expected = resourceType === 'session' ? 'SESSION' : 'WEDDING'
  const actual = getConcept(key).resource
  if (actual !== expected) {
    return toolErr('RESOURCE_MISMATCH', 'concept_resource_mismatch', {
      concept: key,
    })
  }
  return null
}

export function authorizePredicates(
  predicates: V7Predicate[],
  resourceType: 'wedding' | 'session' = 'wedding',
):
  | { ok: true; normalized: Array<{ concept: ConceptKey; cmp: string; value: boolean | number | string | null }> }
  | V7ToolError {
  const normalized: Array<{
    concept: ConceptKey
    cmp: string
    value: boolean | number | string | null
  }> = []
  for (const p of predicates) {
    const resolved = resolveConceptKey(p.concept)
    if (!resolved.ok) return resolved
    const matchErr = assertConceptMatchesResource(resolved.key, resourceType)
    if (matchErr) return matchErr
    const cmpErr = assertComparator(resolved.key, p.comparator)
    if (cmpErr) return cmpErr
    normalized.push({
      concept: resolved.key,
      cmp: p.comparator,
      value: p.value,
    })
  }
  return { ok: true, normalized }
}

export function resolveRelationKey(
  raw: string,
): { ok: true; key: RelationKey } | V7ToolError {
  if (!(ALL_RELATION_KEYS as readonly string[]).includes(raw)) {
    return toolErr('UNSUPPORTED_RELATION', 'relation_not_allowed')
  }
  return { ok: true, key: raw as RelationKey }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateDateBounds(
  start?: string,
  end?: string,
): V7ToolError | null {
  if (start != null && !ISO_DATE.test(start)) {
    return toolErr('INVALID_DATE_BOUNDS', 'date_start_invalid')
  }
  if (end != null && !ISO_DATE.test(end)) {
    return toolErr('INVALID_DATE_BOUNDS', 'date_end_invalid')
  }
  if (start && end && start > end) {
    return toolErr('INVALID_DATE_BOUNDS', 'start_after_end')
  }
  return null
}

export function validateLimit(
  limit: number | undefined,
  max = 40,
): V7ToolError | null {
  if (limit === undefined) return null
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    return toolErr('LIMIT_INVALID', 'limit_out_of_bounds')
  }
  return null
}

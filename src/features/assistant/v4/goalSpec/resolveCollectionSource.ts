/**
 * S1 — Deterministic collection-source resolution (Context Resolver slice).
 *
 * Inputs only: typed GoalSpec, active DomainQuery, page/resource, Field Registry.
 * Never: utterance text, regex, labels, phrase maps.
 */

import type { DomainQuery, DomainQuerySource } from '../domainQuery/domainQuery'
import {
  getFieldCollectionSource,
  type FieldCollectionSource,
} from '../domainQuery/fieldRegistry'
import type { GoalSpec } from './goalSpec'

/** Lookup injectable for synthetic compatibility tests (not production fields). */
export type CollectionSourceLookup = (
  fieldId: string,
) => FieldCollectionSource | string | null

export type ResolveCollectionSourceContext = {
  activeCollectionQuery?: DomainQuery | null
  activeResource?: { kind: string; id?: string } | null
  /**
   * Test-only override. Production uses registry getFieldCollectionSource.
   * May return non-G7 source ids to prove incompatibility (never invent prod fields).
   */
  getCollectionSource?: CollectionSourceLookup
}

export type ResolveCollectionSourceResult =
  | {
      status: 'resolved'
      source: DomainQuerySource
      via: 'explicit' | 'measure' | 'date_dimension' | 'inherited' | 'page'
    }
  | {
      /** Sum without measure — wait for measure clarification; do not invent source. */
      status: 'defer_for_measure'
    }
  | { status: 'missing'; reason: string }
  | { status: 'unsupported'; reason: string }
  | {
      status: 'incompatible'
      reason: string
      required: string
      candidate: string
    }

const G7_SOURCES = new Set<string>(['wedding'])

function lookupSource(
  fieldId: string | null | undefined,
  get: CollectionSourceLookup,
): string | null {
  if (!fieldId) return null
  return get(fieldId)
}

/**
 * True when candidate may satisfy a required collectionSource constraint.
 * null required = no constraint from typed fields.
 */
export function isSourceCompatible(
  required: string | null,
  candidate: string | null,
): boolean {
  if (required == null || candidate == null) return true
  return required === candidate
}

function pageSource(
  resource: ResolveCollectionSourceContext['activeResource'],
): DomainQuerySource | null {
  if (resource?.kind === 'wedding') return 'wedding'
  return null
}

function asG7Source(source: string): DomainQuerySource | null {
  if (source === 'wedding') return 'wedding'
  return null
}

/**
 * Resolve primary DomainQuery collection source.
 *
 * Precedence:
 * 1. explicit goal.source
 * 2. registry ownership from explicit measure
 * 3. registry ownership from explicit dateDimension
 * 4. compatible active DomainQuery.source
 * 5. compatible page/resource
 * 6. defer when sum + unresolved measure
 * 7. missing
 */
export function resolveCollectionSource(
  goal: GoalSpec,
  ctx: ResolveCollectionSourceContext = {},
): ResolveCollectionSourceResult {
  const get: CollectionSourceLookup =
    ctx.getCollectionSource ?? ((id) => getFieldCollectionSource(id))

  const measureOwned = lookupSource(goal.measure, get)
  const dateOwned = lookupSource(goal.temporal?.dateDimension ?? null, get)
  const fieldRequired = measureOwned ?? dateOwned

  // 1) Explicit goal.source
  if (goal.source != null) {
    if (!isSourceCompatible(fieldRequired, goal.source)) {
      return {
        status: 'incompatible',
        reason: 'explicit_source_incompatible_with_field_ownership',
        required: fieldRequired!,
        candidate: goal.source,
      }
    }
    const g7 = asG7Source(goal.source)
    if (!g7) {
      return {
        status: 'unsupported',
        reason: `source_${goal.source}_not_in_g7_slice`,
      }
    }
    return { status: 'resolved', source: g7, via: 'explicit' }
  }

  // 2) Explicit measure ownership
  if (measureOwned != null) {
    const g7 = asG7Source(measureOwned)
    if (!g7) {
      return {
        status: 'unsupported',
        reason: `source_${measureOwned}_not_in_g7_slice`,
      }
    }
    return { status: 'resolved', source: g7, via: 'measure' }
  }

  // 3) Explicit dateDimension ownership
  if (dateOwned != null) {
    const g7 = asG7Source(dateOwned)
    if (!g7) {
      return {
        status: 'unsupported',
        reason: `source_${dateOwned}_not_in_g7_slice`,
      }
    }
    return { status: 'resolved', source: g7, via: 'date_dimension' }
  }

  // 4) Compatible active DomainQuery
  const inherited = ctx.activeCollectionQuery?.source ?? null
  if (inherited != null) {
    if (!isSourceCompatible(fieldRequired, inherited)) {
      return {
        status: 'incompatible',
        reason: 'inherited_source_incompatible_with_field_ownership',
        required: fieldRequired!,
        candidate: inherited,
      }
    }
    const g7 = asG7Source(inherited)
    if (g7) {
      return { status: 'resolved', source: g7, via: 'inherited' }
    }
  }

  // 5) Compatible page/resource
  const page = pageSource(ctx.activeResource ?? null)
  if (page != null) {
    if (!isSourceCompatible(fieldRequired, page)) {
      return {
        status: 'incompatible',
        reason: 'page_source_incompatible_with_field_ownership',
        required: fieldRequired!,
        candidate: page,
      }
    }
    return { status: 'resolved', source: page, via: 'page' }
  }

  // 6) Sum without measure — defer (clarification owns measure patch only)
  if (goal.aggregation === 'sum' && goal.measure == null) {
    return { status: 'defer_for_measure' }
  }

  // 7) Missing
  void G7_SOURCES
  return { status: 'missing', reason: 'source_missing' }
}

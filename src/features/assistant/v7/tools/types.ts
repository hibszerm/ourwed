/**
 * V7 tool argument types — no tenant/user/owner IDs, no raw UUIDs from model.
 */

import type { ConceptKey } from '../../shared/registry'

export type V7Predicate = {
  concept: string
  comparator: string
  value: boolean | number | string | null
}

export type V7SearchArgs = {
  resource_type?: string
  date_start?: string
  date_end?: string
  predicates?: V7Predicate[]
  sort?: { concept: string; direction?: 'asc' | 'desc' }
  limit?: number
}

export type V7RefineArgs = {
  handle: string
  predicates: V7Predicate[]
}

export type V7SortArgs = {
  handle: string
  concept: string
  direction?: 'asc' | 'desc'
  limit?: number
  /**
   * Phase 2K.10-E1 — optional model-chosen evidence concepts for sorted members.
   * Absent → Golden sort-only behavior. Never inferred by the application.
   */
  evidence_concepts?: string[]
}

export type V7AggregateArgs = {
  handle: string
  concept: string
  operation: 'count' | 'sum'
}

export type V7InspectArgs = {
  handle: string
  /** 1-based ordinal within the set; omit when set has exactly one member. */
  ordinal?: number
  concepts: string[]
}

export type V7ListRelatedArgs = {
  handle: string
  ordinal?: number
  relation: string
}

export type V7DescribeSetArgs = {
  handle: string
  /** Max preview rows (bounded). */
  limit?: number
}

/**
 * Phase 2I.1 — deterministic nearest mixed assignments (weddings + sessions).
 * Prefer this over per-type top-K then glue. Limit applies after merge.
 */
export type V7SelectNearestAssignmentsArgs = {
  /** Required top-K (1–12). */
  limit: number
  /** Inclusive start YYYY-MM-DD; defaults to session todayKey when omitted. */
  date_start?: string
  /** Inclusive end YYYY-MM-DD. */
  date_end?: string
  /** Default true. */
  include_weddings?: boolean
  /** Default true. */
  include_sessions?: boolean
  /**
   * Optional existing wedding ResourceSet — use its members as wedding candidates
   * instead of a fresh universe date filter (still date-enriched from universe).
   */
  wedding_handle?: string
  /** Optional existing session ResourceSet — same as wedding_handle. */
  session_handle?: string
}

/** K2 — product knowledge search (model-authored query/terms; no Host NL routing). */
export type V7SearchProductKnowledgeArgs = {
  query?: string
  terms?: string[]
  capability_id?: string
  limit?: number
}

/** Forbidden identity keys — model must never supply these. */
export const V7_FORBIDDEN_IDENTITY_KEYS = [
  'ownerId',
  'userId',
  'tenantId',
  'owner_id',
  'user_id',
  'tenant_id',
  'studioId',
  'studio_id',
] as const

export type ConceptKeyOrString = ConceptKey | string

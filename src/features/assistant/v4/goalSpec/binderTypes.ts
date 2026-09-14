/**
 * G7 — Binder clarification + conversation context inputs.
 * Semantic only — no user-facing copy, no LLM.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { GoalMissingSlot } from './goalSpec'

/**
 * Authoritative semantic inputs for bindGoalSpec.
 * Intentionally excludes: CollectionQuery, legacy filters, result membership,
 * result rows, and prose history.
 */
export type GoalBinderContext = {
  /** Collection semantic SoT when present. */
  activeCollectionQuery: DomainQuery | null
  /**
   * Page or conversational resource seed (wedding/session).
   * Lower precedence than activeCollectionQuery for collection filters.
   */
  activeResource: {
    kind: 'wedding' | 'session'
    id: string
  } | null
  /**
   * S1 test seam — synthetic collectionSource lookup for compatibility proofs.
   * Production omits this (registry is authoritative).
   */
  getCollectionSource?: (fieldId: string) => string | null
}

export type BinderNeedsClarification = {
  reason: string
  missingSlots: GoalMissingSlot[]
  ambiguousSlots: GoalMissingSlot[]
  choices?: Array<{ id: string; label: string }>
  /** Opaque preservation for future turn resume — not Polish copy. */
  preservedContext?: {
    activeCollectionQuery: DomainQuery | null
  }
}

export type BindGoalSpecResult =
  | { status: 'bound'; goal: import('./boundGoal').BoundGoal }
  | { status: 'needs_clarification'; clarification: BinderNeedsClarification }
  | { status: 'unsupported'; reason: string }

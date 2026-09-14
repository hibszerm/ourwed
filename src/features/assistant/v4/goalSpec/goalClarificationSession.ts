/**
 * U2 — Ephemeral GoalSpec clarification session (shadow / local).
 * Cleared on Assistant close. Never persisted.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { GoalClarificationRequest } from './goalClarificationTypes'

type GoalClarificationSession = {
  pending: GoalClarificationRequest | null
  /** Last successfully compiled DomainQuery this session (follow-up SoT). */
  activeCollectionQuery: DomainQuery | null
}

let session: GoalClarificationSession = {
  pending: null,
  activeCollectionQuery: null,
}

export function clearGoalClarificationSession(): void {
  session = {
    pending: null,
    activeCollectionQuery: null,
  }
}

/** Supersede pending chips without wiping follow-up DomainQuery SoT. */
export function clearPendingGoalClarificationOnly(): void {
  session.pending = null
}

export function getPendingGoalClarification(): GoalClarificationRequest | null {
  return session.pending
}

export function setPendingGoalClarification(
  request: GoalClarificationRequest | null,
): void {
  session.pending = request
}

export function getGoalClarificationActiveCollection(): DomainQuery | null {
  return session.activeCollectionQuery
}

export function setGoalClarificationActiveCollection(
  query: DomainQuery | null,
): void {
  session.activeCollectionQuery = query
}

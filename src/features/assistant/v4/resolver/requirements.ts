/**
 * Declarative semantic requirements for Context Resolver.
 * Minimal domain knowledge — not a rewrite hub.
 */

import type { TaskOperation, TaskSubject } from '../taskSpec'

export type DiscoveryKind =
  | 'schedule'
  | 'wedding_search'
  | 'session_search'
  | 'collection'

export type TaskRequirement = {
  /** Prefer active wedding/session when present. */
  preferActiveResource?: boolean
  /** Participant binding required for resolution. */
  participantRequired?: boolean
  /** If no bound resource/assignment and temporal present → schedule discovery. */
  scheduleDiscoveryIfUnbound?: boolean
  /** Collection ops do not bind activeResource. */
  isCollection?: boolean
  /** Sequence cursor required. */
  sequenceRequired?: boolean
}

export function lookupTaskRequirement(
  op: TaskOperation,
  subject: TaskSubject | null,
): TaskRequirement {
  if (op === 'unsupported') return {}
  if (op === 'prepare_create') return {}
  if (op === 'get_next') return { sequenceRequired: true }
  if (op === 'count' || op === 'sum' || op === 'rank' || op === 'list') {
    return { isCollection: true }
  }
  if (op === 'open') {
    return { preferActiveResource: false }
  }

  if (subject === 'assignment' || subject === 'schedule') {
    return {
      preferActiveResource: false,
      scheduleDiscoveryIfUnbound: true,
    }
  }

  if (subject === 'preparations') {
    return {
      preferActiveResource: true,
      participantRequired: false,
    }
  }

  if (
    subject === 'ceremony' ||
    subject === 'reception' ||
    subject === 'day_plan' ||
    subject === 'wedding' ||
    subject === 'payment' ||
    subject === 'remaining' ||
    subject === 'paid' ||
    subject === 'deposit' ||
    subject === 'contract_value' ||
    subject === 'task' ||
    subject === 'next_action' ||
    subject === 'route'
  ) {
    return { preferActiveResource: true }
  }

  if (subject === 'session') {
    return { preferActiveResource: true }
  }

  return { preferActiveResource: true }
}

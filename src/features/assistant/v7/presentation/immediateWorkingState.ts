/**
 * Phase 2K.10-P1 — immediate Assistant working-state transcript helpers.
 *
 * Frontend-only perceived-latency: append the pending user row (and rely on
 * Host `loading` → AssistantProcessingIndicator) before runtime/auth/V7 work.
 * Does not change V7 agent/loop/presentation semantics.
 */

import type {
  AssistantPresentationTurn,
  TranscriptEntry,
} from './types'

export function v7UserEntryId(turnId: string): string {
  return `${turnId}-user`
}

export function v7AssistantEntryId(turnId: string): string {
  return `${turnId}-assistant`
}

/** Append pending user entry once — never duplicate by turn id. */
export function appendImmediatePendingUser(
  prev: TranscriptEntry[],
  turnId: string,
  userText: string,
): TranscriptEntry[] {
  const id = v7UserEntryId(turnId)
  if (prev.some((e) => e.id === id)) return prev
  return [
    ...prev,
    {
      id,
      role: 'user',
      text: userText,
      status: 'pending',
    },
  ]
}

/** Mark user sent + append one assistant presentation (no duplicate assistant). */
export function completePendingUserWithPresentation(
  prev: TranscriptEntry[],
  turnId: string,
  presentation: AssistantPresentationTurn,
): TranscriptEntry[] {
  const userEntryId = v7UserEntryId(turnId)
  const assistantId = v7AssistantEntryId(turnId)
  if (prev.some((e) => e.id === assistantId)) return prev
  return [
    ...prev.map((e) =>
      e.id === userEntryId && e.role === 'user'
        ? { ...e, status: 'sent' as const }
        : e,
    ),
    {
      id: assistantId,
      role: 'assistant',
      presentation,
      status:
        presentation.status === 'error'
          ? ('error' as const)
          : ('ready' as const),
    },
  ]
}

/** Existing API-failure UX as a single assistant error row (no stuck pending). */
export function completePendingUserWithApiFailure(
  prev: TranscriptEntry[],
  turnId: string,
  userText: string,
  failureMessage: string,
): TranscriptEntry[] {
  return completePendingUserWithPresentation(prev, turnId, {
    message: failureMessage,
    status: 'error',
    retryUtterance: userText,
  })
}

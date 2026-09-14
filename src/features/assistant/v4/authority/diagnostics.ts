/**
 * IC1 — compact semantic diagnostics (no PII / CRM rows).
 */

import type {
  AssistantAuthorityDecision,
  AssistantAuthorityDiagnostic,
  AssistantV5Mode,
  DomainQueryStatusKind,
  ResolverOutcomeKind,
} from './types'

export function buildAuthorityDiagnostic(input: {
  turnId: string
  decision: AssistantAuthorityDecision
  effectiveMode: AssistantV5Mode
  interpreterStatus: AssistantAuthorityDiagnostic['interpreterStatus']
  resolverOutcome: ResolverOutcomeKind | null
  domainQueryStatus: DomainQueryStatusKind
  canaryEligible: boolean
  latencyMs?: number
  outcomeCode?: string
}): AssistantAuthorityDiagnostic {
  const d = input.decision
  return {
    turnId: input.turnId,
    authorityDecision: d.kind,
    visibleOwner: d.visibleOwner,
    eligibleForV5Authority: d.eligibleForV5Authority,
    canaryEligible: input.canaryEligible,
    requestKind:
      d.kind === 'v5_authority' || d.kind === 'v5_clarification'
        ? d.requestKind
        : d.kind === 'v3_fallback'
          ? d.requestKind
          : null,
    interpreterStatus: input.interpreterStatus,
    resolverOutcome: input.resolverOutcome,
    domainQueryStatus: input.domainQueryStatus,
    clarificationSlot:
      d.kind === 'v5_clarification' ? d.clarificationSlot : undefined,
    fallbackReason: d.kind === 'v3_fallback' ? d.reason : undefined,
    safeErrorReason: d.kind === 'safe_error' ? d.reason : undefined,
    outcomeCode: input.outcomeCode,
    latencyMs: input.latencyMs,
    effectiveMode: input.effectiveMode,
  }
}

const listeners = new Set<(d: AssistantAuthorityDiagnostic) => void>()

export function subscribeAssistantAuthorityDiagnostics(
  fn: (d: AssistantAuthorityDiagnostic) => void,
): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitAssistantAuthorityDiagnostic(
  d: AssistantAuthorityDiagnostic,
): void {
  for (const fn of listeners) {
    try {
      fn(d)
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env?.DEV) {
    console.debug('[assistant-authority]', d)
  }
}

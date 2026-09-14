/**
 * PC1 — central authority decision (typed state only).
 * No utterance / regex / phrase heuristics.
 */

import {
  PC1_OWNERSHIP_UNLOCKED,
  type AssistantAuthorityDecision,
  type AssistantV5Mode,
  type DomainQueryStatusKind,
  type ResolverOutcomeKind,
  type TypedFallbackReason,
} from './types'
import { modeAllowsV5Ownership } from './resolveEffectiveMode'

export type DecideAssistantAuthorityInput = {
  effectiveMode: AssistantV5Mode
  /** GoalSpec.requestKind when interpret succeeded. */
  requestKind: string | null
  interpreterStatus:
    | 'ok'
    | 'schema_error'
    | 'provider_error'
    | 'invoke_error'
    | 'skipped'
    | 'unsupported'
    | null
  resolverOutcome: ResolverOutcomeKind | null
  clarificationSlot?: string | null
  domainQueryStatus: DomainQueryStatusKind
  /** Future canary allowlist seam — PC1 always false. */
  canaryEligible?: boolean
  /** Hard security / write invariant. */
  securityViolation?: boolean
  writeAttemptOnReadPath?: boolean
}

function familyEligibleForReadQueryAuthority(
  requestKind: string | null,
): boolean {
  return requestKind === 'domain_query'
}

export function decideAssistantAuthority(
  input: DecideAssistantAuthorityInput,
): AssistantAuthorityDecision {
  if (input.securityViolation) {
    return {
      kind: 'safe_error',
      visibleOwner: 'none',
      ownershipActive: false,
      eligibleForV5Authority: false,
      reason: 'SECURITY_BOUNDARY_VIOLATION',
    }
  }
  if (input.writeAttemptOnReadPath) {
    return {
      kind: 'safe_error',
      visibleOwner: 'none',
      ownershipActive: false,
      eligibleForV5Authority: false,
      reason: 'WRITE_ATTEMPT_ON_READ_PATH',
    }
  }

  if (input.effectiveMode === 'off') {
    return {
      kind: 'v3_fallback',
      visibleOwner: 'v3',
      ownershipActive: false,
      eligibleForV5Authority: false,
      reason: 'MODE_NOT_AUTHORITATIVE',
      requestKind: input.requestKind,
      resolverOutcome: input.resolverOutcome,
    }
  }

  if (input.interpreterStatus === 'schema_error') {
    return fallback('INTERPRETER_SCHEMA_ERROR', input, false)
  }
  if (
    input.interpreterStatus === 'provider_error' ||
    input.interpreterStatus === 'invoke_error'
  ) {
    return fallback('INTERPRETER_PROVIDER_ERROR', input, false)
  }

  if (input.interpreterStatus === 'unsupported' || input.requestKind === 'unsupported') {
    return fallback('UNSUPPORTED_REQUEST', input, false)
  }

  if (
    input.requestKind === 'product_help' ||
    input.requestKind === 'prepare_action' ||
    input.requestKind === 'goal_plan' ||
    input.requestKind === 'clarification'
  ) {
    return fallback('REQUEST_FAMILY_NOT_ELIGIBLE', input, false)
  }

  if (!familyEligibleForReadQueryAuthority(input.requestKind)) {
    if (input.interpreterStatus === 'skipped' || input.requestKind == null) {
      return fallback('MODE_NOT_AUTHORITATIVE', input, false)
    }
    return fallback('REQUEST_FAMILY_NOT_ELIGIBLE', input, false)
  }

  if (input.resolverOutcome === 'needs_clarification') {
    const slot = input.clarificationSlot?.trim() || 'unknown'
    const eligible = true
    // PC1: clarification is diagnostic/shadow only — visible V3
    if (!PC1_OWNERSHIP_UNLOCKED || !modeAllowsV5Ownership(input.effectiveMode)) {
      return {
        kind: 'v5_clarification',
        ownershipActive: false,
        eligibleForV5Authority: eligible,
        visibleOwner: 'v3',
        requestKind: 'domain_query',
        clarificationSlot: slot,
        resolverOutcome: 'needs_clarification',
      }
    }
    return {
      kind: 'v5_clarification',
      ownershipActive: false,
      eligibleForV5Authority: eligible,
      visibleOwner: 'v3',
      requestKind: 'domain_query',
      clarificationSlot: slot,
      resolverOutcome: 'needs_clarification',
    }
  }

  if (input.resolverOutcome === 'unsupported') {
    return fallback('UNSUPPORTED_REQUEST', input, false)
  }

  if (input.resolverOutcome === 'bound') {
    if (input.domainQueryStatus === 'invalid') {
      return fallback('DOMAIN_QUERY_INVALID', input, true)
    }
    if (input.domainQueryStatus === 'execution_unavailable') {
      return fallback('EXECUTION_UNAVAILABLE', input, true)
    }

    const ownershipWouldApply =
      PC1_OWNERSHIP_UNLOCKED &&
      modeAllowsV5Ownership(input.effectiveMode) &&
      (input.effectiveMode === 'authority_read_query' ||
        (input.effectiveMode === 'canary' && Boolean(input.canaryEligible)))

    if (!ownershipWouldApply) {
      // Eligible pipeline, but PC1 / mode keeps V3 visible
      if (
        input.effectiveMode === 'canary' ||
        input.effectiveMode === 'authority_read_query'
      ) {
        return fallback(
          input.canaryEligible === false
            ? 'CANARY_INELIGIBLE'
            : 'MODE_NOT_AUTHORITATIVE',
          input,
          true,
        )
      }
      return {
        kind: 'v5_authority',
        ownershipActive: false,
        eligibleForV5Authority: true,
        visibleOwner: 'v3',
        requestKind: 'domain_query',
        resolverOutcome: 'bound',
      }
    }

    // Unreachable while PC1_OWNERSHIP_UNLOCKED is false — keep type-safe fail-closed
    return fallback('MODE_NOT_AUTHORITATIVE', input, true)
  }

  return fallback('MODE_NOT_AUTHORITATIVE', input, false)
}

function fallback(
  reason: TypedFallbackReason,
  input: DecideAssistantAuthorityInput,
  eligible: boolean,
): AssistantAuthorityDecision {
  return {
    kind: 'v3_fallback',
    visibleOwner: 'v3',
    ownershipActive: false,
    eligibleForV5Authority: eligible,
    reason,
    requestKind: input.requestKind,
    resolverOutcome: input.resolverOutcome,
  }
}

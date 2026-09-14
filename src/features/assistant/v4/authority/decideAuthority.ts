/**
 * IC1 — central authority decision (typed state only).
 * No utterance / regex / phrase heuristics.
 */

import {
  IC1_OWNERSHIP_UNLOCKED,
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
  /**
   * Server-attested canary allowlist eligibility.
   * Never trust client-spoofed values outside fetchAssistantRuntimeConfig.
   */
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

function ownershipGateOpen(input: DecideAssistantAuthorityInput): boolean {
  if (!IC1_OWNERSHIP_UNLOCKED) return false
  if (!modeAllowsV5Ownership(input.effectiveMode)) return false
  if (input.effectiveMode === 'canary') {
    return Boolean(input.canaryEligible)
  }
  // authority_read_query reserved — still require allowlist in IC1
  return Boolean(input.canaryEligible)
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
    input.requestKind === 'clarification' ||
    input.requestKind === 'route'
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
    if (ownershipGateOpen(input)) {
      return {
        kind: 'v5_clarification',
        ownershipActive: true,
        eligibleForV5Authority: true,
        visibleOwner: 'v5',
        requestKind: 'domain_query',
        clarificationSlot: slot,
        resolverOutcome: 'needs_clarification',
      }
    }
    // Shadow / non-allowlisted canary: diagnostic clarification, V3 visible
    if (
      input.effectiveMode === 'canary' &&
      input.canaryEligible === false
    ) {
      return fallback('CANARY_INELIGIBLE', input, true)
    }
    return {
      kind: 'v5_clarification',
      ownershipActive: false,
      eligibleForV5Authority: true,
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
    if (input.domainQueryStatus === 'slice_ineligible') {
      return fallback('DOMAIN_QUERY_SLICE_INELIGIBLE', input, false)
    }
    if (input.domainQueryStatus === 'execution_unavailable') {
      return fallback('EXECUTION_UNAVAILABLE', input, true)
    }

    const pipelineEligible =
      input.domainQueryStatus === 'valid' ||
      input.domainQueryStatus === 'executed'

    if (!pipelineEligible) {
      return fallback('DOMAIN_QUERY_INVALID', input, true)
    }

    if (ownershipGateOpen(input)) {
      return {
        kind: 'v5_authority',
        ownershipActive: true,
        eligibleForV5Authority: true,
        visibleOwner: 'v5',
        requestKind: 'domain_query',
        resolverOutcome: 'bound',
      }
    }

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

    // shadow: eligible pipeline, V3 remains visible
    return {
      kind: 'v5_authority',
      ownershipActive: false,
      eligibleForV5Authority: true,
      visibleOwner: 'v3',
      requestKind: 'domain_query',
      resolverOutcome: 'bound',
    }
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

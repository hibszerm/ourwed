/**
 * CR1 — Canary re-entry eligibility (composed typed signals).
 *
 * Does NOT duplicate SC1. Composes:
 *   interpret status → resolver → IC1 slice → SemanticCoverage → decideAssistantAuthority
 *
 * Answers: if runtime were CANARY + allowlisted, would this turn receive
 * visible V5 ownership (authority or typed clarification)?
 *
 * No utterance / phrase / LLM verifier.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { BoundGoal } from '../goalSpec/boundGoal'
import type { GoalSpec } from '../goalSpec/goalSpec'
import {
  assessSemanticCoverage,
  type SemanticCoverageReason,
} from '../goalSpec/semanticCoverage'
import { isIc1CanaryDomainQueryEligible } from './canarySlice'
import { decideAssistantAuthority } from './decideAuthority'
import type {
  AssistantAuthorityDecision,
  DomainQueryStatusKind,
  ResolverOutcomeKind,
  TypedFallbackReason,
} from './types'

export type CanaryReentryReasonCode =
  | TypedFallbackReason
  | SemanticCoverageReason
  | 'INTERPRETER_NOT_OK'
  | 'RESOLVER_NOT_BOUND'
  | 'SLICE_INELIGIBLE'
  | 'COVERAGE_NOT_ASSESSED'

export type CanaryReentryEligibility =
  | {
      status: 'eligible'
      kind: 'v5_authority' | 'v5_clarification'
      /** True only under simulated canary+allowlist ownership. */
      wouldOwnVisibly: true
      decision: AssistantAuthorityDecision
    }
  | {
      status: 'ineligible'
      reasonCodes: CanaryReentryReasonCode[]
      decision: AssistantAuthorityDecision
      wouldOwnVisibly: false
    }

export type AssessCanaryReentryInput = {
  goalSpec: GoalSpec | null
  boundGoal?: BoundGoal | null
  domainQuery?: DomainQuery | null
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
  /**
   * Optional override — when omitted, derived from DomainQuery + IC1 slice
   * for bound outcomes.
   */
  domainQueryStatus?: DomainQueryStatusKind
}

function pushUnique(codes: CanaryReentryReasonCode[], code: CanaryReentryReasonCode) {
  if (!codes.includes(code)) codes.push(code)
}

/**
 * Structural canary re-entry gate under simulated canary + allowlisted user.
 * Runtime mode is NOT read — this is eligibility for a future explicit switch.
 */
export function assessCanaryReentryEligibility(
  input: AssessCanaryReentryInput,
): CanaryReentryEligibility {
  const reasonCodes: CanaryReentryReasonCode[] = []
  const requestKind = input.goalSpec?.requestKind ?? null

  let domainQueryStatus: DomainQueryStatusKind =
    input.domainQueryStatus ?? 'not_attempted'
  let semanticCoverageStatus: 'complete' | 'incomplete' | 'not_assessed' =
    'not_assessed'
  let semanticCoverageReasons: string[] | undefined

  if (input.resolverOutcome === 'bound') {
    if (!input.domainQuery) {
      domainQueryStatus = 'invalid'
      pushUnique(reasonCodes, 'DOMAIN_QUERY_INVALID')
    } else if (!isIc1CanaryDomainQueryEligible(input.domainQuery)) {
      domainQueryStatus = input.domainQueryStatus ?? 'slice_ineligible'
      pushUnique(reasonCodes, 'SLICE_INELIGIBLE')
      pushUnique(reasonCodes, 'DOMAIN_QUERY_SLICE_INELIGIBLE')
    } else {
      domainQueryStatus = input.domainQueryStatus ?? 'valid'
    }

    if (input.goalSpec && input.domainQuery) {
      const coverage = assessSemanticCoverage({
        goalSpec: input.goalSpec,
        boundGoal: input.boundGoal,
        domainQuery: input.domainQuery,
      })
      semanticCoverageStatus = coverage.status
      if (coverage.status === 'incomplete') {
        semanticCoverageReasons = coverage.reasonCodes
        for (const c of coverage.reasonCodes) pushUnique(reasonCodes, c)
        pushUnique(reasonCodes, 'SEMANTIC_COVERAGE_INCOMPLETE')
      }
    } else {
      semanticCoverageStatus = 'not_assessed'
      pushUnique(reasonCodes, 'COVERAGE_NOT_ASSESSED')
    }
  }

  if (
    input.interpreterStatus &&
    input.interpreterStatus !== 'ok' &&
    input.interpreterStatus !== 'skipped'
  ) {
    pushUnique(reasonCodes, 'INTERPRETER_NOT_OK')
  }

  if (
    input.resolverOutcome &&
    input.resolverOutcome !== 'bound' &&
    input.resolverOutcome !== 'needs_clarification'
  ) {
    pushUnique(reasonCodes, 'RESOLVER_NOT_BOUND')
  }

  const decision = decideAssistantAuthority({
    effectiveMode: 'canary',
    canaryEligible: true,
    requestKind,
    interpreterStatus: input.interpreterStatus,
    resolverOutcome: input.resolverOutcome,
    clarificationSlot: input.clarificationSlot ?? null,
    domainQueryStatus,
    semanticCoverageStatus,
    semanticCoverageReasons,
    writeAttemptOnReadPath: requestKind === 'prepare_action',
  })

  if (
    decision.kind === 'v5_authority' &&
    decision.ownershipActive &&
    decision.visibleOwner === 'v5'
  ) {
    return {
      status: 'eligible',
      kind: 'v5_authority',
      wouldOwnVisibly: true,
      decision,
    }
  }

  if (
    decision.kind === 'v5_clarification' &&
    decision.ownershipActive &&
    decision.visibleOwner === 'v5'
  ) {
    return {
      status: 'eligible',
      kind: 'v5_clarification',
      wouldOwnVisibly: true,
      decision,
    }
  }

  if (decision.kind === 'v3_fallback') {
    pushUnique(reasonCodes, decision.reason)
  } else if (decision.kind === 'safe_error') {
    pushUnique(reasonCodes, 'INTERPRETER_NOT_OK')
  } else if (
    decision.kind === 'v5_authority' ||
    decision.kind === 'v5_clarification'
  ) {
    // Shadow-style eligible-but-not-owning should not occur under canary+allowlist.
    pushUnique(reasonCodes, 'MODE_NOT_AUTHORITATIVE')
  }

  return {
    status: 'ineligible',
    reasonCodes,
    decision,
    wouldOwnVisibly: false,
  }
}

export function isCanaryReentryEligible(
  result: CanaryReentryEligibility,
): boolean {
  return result.status === 'eligible'
}

/**
 * V6-F1 — Capability + shadow authority (no visible ownership in F1).
 */

import type { SemanticAction } from '../semantics/types'
import type { V6ToolFailureCode } from '../tools/errors'

export type V6CapabilityResult =
  | { supported: true }
  | { supported: false; code: 'UNSUPPORTED_CAPABILITY'; detail: string }

export type V6AuthorityStatus =
  | 'shadow_eligible'
  | 'shadow_blocked'
  | 'clarify'
  | 'unsupported'
  | 'safe_error'

export type V6AuthorityDecision = {
  status: V6AuthorityStatus
  /** F1: never visible product authority. */
  visibleOwner: 'none'
  semanticFidelity: 'ok' | 'incomplete' | 'unsupported'
  capability: 'ok' | 'unsupported'
  authorization: 'ok' | 'denied'
  execution: 'ok' | 'failed' | 'not_run'
  observation: 'ok' | 'invalid' | 'none'
  financeProvenance: 'canonical_finance' | 'collection_count' | 'n/a' | 'missing'
  reasons: string[]
}

const ENABLED_TOOLS = new Set([
  'query_collection',
  'transform_collection',
  'aggregate_collection',
  'restore_collection',
])

export function assessToolCapability(toolName: string): V6CapabilityResult {
  if (toolName === 'prepare_action') {
    return {
      supported: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: 'prepare_action_disabled_f1',
    }
  }
  if (!ENABLED_TOOLS.has(toolName)) {
    return {
      supported: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: `tool_not_enabled:${toolName}`,
    }
  }
  return { supported: true }
}

export function assessActionCapability(
  action: SemanticAction,
): V6CapabilityResult {
  if (action.type === 'Unsupported') {
    return {
      supported: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: action.reason,
    }
  }
  if (action.type === 'PrepareAction') {
    return {
      supported: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: 'prepare_action_disabled_f1',
    }
  }
  if (action.type === 'Clarify') {
    return { supported: true }
  }
  if (action.type === 'Search' && action.source !== 'wedding') {
    return {
      supported: false,
      code: 'UNSUPPORTED_CAPABILITY',
      detail: 'source_not_wedding',
    }
  }
  return { supported: true }
}

export function decideV6Authority(input: {
  action?: SemanticAction | null
  toolOk?: boolean
  toolFailureCode?: V6ToolFailureCode | null
  observationValid?: boolean
  financeProvenance?: V6AuthorityDecision['financeProvenance']
}): V6AuthorityDecision {
  const reasons: string[] = []
  let semanticFidelity: V6AuthorityDecision['semanticFidelity'] = 'ok'
  let capability: V6AuthorityDecision['capability'] = 'ok'
  let authorization: V6AuthorityDecision['authorization'] = 'ok'
  let execution: V6AuthorityDecision['execution'] = 'not_run'
  let observation: V6AuthorityDecision['observation'] = 'none'
  const financeProvenance = input.financeProvenance ?? 'n/a'

  if (input.action) {
    const cap = assessActionCapability(input.action)
    if (!cap.supported) {
      capability = 'unsupported'
      reasons.push(cap.detail)
      if (input.action.type === 'Unsupported') {
        semanticFidelity = 'unsupported'
        return {
          status: 'unsupported',
          visibleOwner: 'none',
          semanticFidelity,
          capability,
          authorization,
          execution,
          observation,
          financeProvenance,
          reasons,
        }
      }
    }
    if (input.action.type === 'Clarify') {
      return {
        status: 'clarify',
        visibleOwner: 'none',
        semanticFidelity: 'incomplete',
        capability: 'ok',
        authorization,
        execution,
        observation,
        financeProvenance,
        reasons: [input.action.reason],
      }
    }
  }

  if (input.toolOk === true) {
    execution = 'ok'
  } else if (input.toolOk === false) {
    execution = 'failed'
    reasons.push(input.toolFailureCode ?? 'tool_failed')
    if (input.toolFailureCode === 'AUTHORIZATION_ERROR') {
      authorization = 'denied'
    }
    if (input.toolFailureCode === 'UNSUPPORTED_CAPABILITY') {
      capability = 'unsupported'
    }
  }

  if (input.observationValid === true) observation = 'ok'
  else if (input.observationValid === false) observation = 'invalid'

  if (
    financeProvenance === 'missing' &&
    input.action?.type === 'Aggregate' &&
    input.action.aggregation === 'sum'
  ) {
    reasons.push('finance_provenance_missing')
    return {
      status: 'safe_error',
      visibleOwner: 'none',
      semanticFidelity,
      capability,
      authorization,
      execution,
      observation,
      financeProvenance,
      reasons,
    }
  }

  const shadowOk =
    capability === 'ok' &&
    authorization === 'ok' &&
    (execution === 'ok' || execution === 'not_run') &&
    observation !== 'invalid'

  return {
    status: shadowOk ? 'shadow_eligible' : 'shadow_blocked',
    visibleOwner: 'none',
    semanticFidelity,
    capability,
    authorization,
    execution,
    observation,
    financeProvenance,
    reasons,
  }
}

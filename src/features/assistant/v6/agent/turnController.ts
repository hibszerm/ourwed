/**
 * V6-F1.3 — Deterministic agent turn lifecycle controller.
 * Reasons only over typed tool/agent state — no Polish phrase interpretation.
 */

import type { V6RequestedOperations } from './requestedOperations'
import { assessRequestedOperationsCapability } from './requestedOperations'

export const V6_MAX_MODEL_DECISIONS = 4

export type ToolCallFingerprint = string

export type V6TurnObservability = {
  modelDecisionCount: number
  executedToolCount: number
  duplicateToolAttemptCount: number
  duplicateToolExecutionCount: number
  repairCount: number
  terminationReason:
    | 'final'
    | 'clarify'
    | 'unsupported'
    | 'repeated_tool_call'
    | 'max_rounds'
    | 'safe_error'
    | 'aborted'
    | null
  unsupportedReason: string | null
  requestedOperationClasses: string[]
  executedOperationClasses: string[]
}

export type V6ExecutionState = {
  completedToolCalls: Array<{
    name: string
    fingerprint: string
    ok: boolean
  }>
  observationsAvailable: string[]
  activeCollectionHandle: string | null
  remainingDecisionBudget: number
  repeatedCallsForbidden: string[]
  lastAggregateOk: boolean
  lastRestoreOk: boolean
}

export type V6TurnController = {
  modelDecisionCount: number
  repairUsed: boolean
  fingerprints: Set<string>
  executedFingerprints: Set<string>
  observability: V6TurnObservability
  requestedOps: V6RequestedOperations | null
}

export function createV6TurnController(): V6TurnController {
  return {
    modelDecisionCount: 0,
    repairUsed: false,
    fingerprints: new Set(),
    executedFingerprints: new Set(),
    requestedOps: null,
    observability: {
      modelDecisionCount: 0,
      executedToolCount: 0,
      duplicateToolAttemptCount: 0,
      duplicateToolExecutionCount: 0,
      repairCount: 0,
      terminationReason: null,
      unsupportedReason: null,
      requestedOperationClasses: [],
      executedOperationClasses: [],
    },
  }
}

export function fingerprintToolCall(
  name: string,
  args: Record<string, unknown>,
  inputHandle?: string,
): ToolCallFingerprint {
  // Stable JSON of validated runtime args (no requested_operations noise)
  const { requested_operations: _rop, ...rest } = args
  const normalized = {
    name,
    inputHandle: inputHandle ?? null,
    args: rest,
  }
  return `${name}::${stableStringify(normalized)}`
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function buildExecutionState(input: {
  controller: V6TurnController
  activeHandle: string | null
  observations: string[]
  lastAggregateOk: boolean
  lastRestoreOk: boolean
}): V6ExecutionState {
  const remaining = Math.max(
    0,
    V6_MAX_MODEL_DECISIONS - input.controller.modelDecisionCount,
  )
  return {
    completedToolCalls: [...input.controller.executedFingerprints].map((fp) => {
      const name = fp.split('::')[0] ?? 'unknown'
      return { name, fingerprint: fp, ok: true }
    }),
    observationsAvailable: input.observations,
    activeCollectionHandle: input.activeHandle,
    remainingDecisionBudget: remaining,
    repeatedCallsForbidden: [...input.controller.executedFingerprints],
    lastAggregateOk: input.lastAggregateOk,
    lastRestoreOk: input.lastRestoreOk,
  }
}

export type ControllerDecision =
  | { action: 'EXECUTE_TOOL' }
  | {
      action: 'BLOCK_DUPLICATE'
      fingerprint: string
      allowRepair: boolean
    }
  | { action: 'UNSUPPORTED'; detail: string }
  | { action: 'BUDGET_EXCEEDED' }
  | { action: 'FINALIZE_OK' }

export function noteModelDecision(controller: V6TurnController): void {
  controller.modelDecisionCount += 1
  controller.observability.modelDecisionCount = controller.modelDecisionCount
}

export function noteRequestedOps(
  controller: V6TurnController,
  ops: V6RequestedOperations,
): ControllerDecision {
  controller.requestedOps = ops
  const classes: string[] = []
  if (ops.needsCollectionSearch) classes.push('search')
  if (ops.needsRefinement) classes.push('refine')
  if (ops.needsSort) classes.push('sort')
  if (ops.needsSlice) classes.push('slice')
  if (ops.needsExclude) classes.push('exclude')
  if (ops.needsAggregate !== 'none') classes.push(`aggregate:${ops.needsAggregate}`)
  if (ops.needsGroup) classes.push('group')
  if (ops.needsRank) classes.push('rank')
  if (ops.needsComparison) classes.push('comparison')
  if (ops.needsRestore) classes.push('restore')
  controller.observability.requestedOperationClasses = classes

  const cap = assessRequestedOperationsCapability(ops)
  if (!cap.supported) {
    controller.observability.terminationReason = 'unsupported'
    controller.observability.unsupportedReason = cap.detail
    return { action: 'UNSUPPORTED', detail: cap.detail }
  }
  return { action: 'EXECUTE_TOOL' }
}

export function decideToolExecution(
  controller: V6TurnController,
  fingerprint: string,
): ControllerDecision {
  if (controller.modelDecisionCount > V6_MAX_MODEL_DECISIONS) {
    controller.observability.terminationReason = 'max_rounds'
    return { action: 'BUDGET_EXCEEDED' }
  }
  if (controller.executedFingerprints.has(fingerprint)) {
    controller.observability.duplicateToolAttemptCount += 1
    const allowRepair = !controller.repairUsed
    return {
      action: 'BLOCK_DUPLICATE',
      fingerprint,
      allowRepair,
    }
  }
  return { action: 'EXECUTE_TOOL' }
}

export function markToolExecuted(
  controller: V6TurnController,
  fingerprint: string,
  toolName: string,
): void {
  controller.executedFingerprints.add(fingerprint)
  controller.fingerprints.add(fingerprint)
  controller.observability.executedToolCount += 1
  if (!controller.observability.executedOperationClasses.includes(toolName)) {
    controller.observability.executedOperationClasses.push(toolName)
  }
}

export function markRepairUsed(controller: V6TurnController): void {
  controller.repairUsed = true
  controller.observability.repairCount += 1
}

export function markTermination(
  controller: V6TurnController,
  reason: NonNullable<V6TurnObservability['terminationReason']>,
  unsupportedReason?: string,
): void {
  controller.observability.terminationReason = reason
  if (unsupportedReason) {
    controller.observability.unsupportedReason = unsupportedReason
  }
}

export const V6_REPAIR_DIAGNOSTIC =
  'That tool call has already been executed and produced sufficient evidence. Return a final answer, a clarification, Unsupported, or a materially different necessary tool call. Do not repeat the same unchanged tool call.'

export const V6_STRUCTURED_OUTCOME_DIAGNOSTIC =
  'No tool was called and no tool evidence is available yet. Respond ONLY with structured outcome JSON: status final|clarify|unsupported (with required nullable fields). Free-form prose is invalid without tool evidence.'

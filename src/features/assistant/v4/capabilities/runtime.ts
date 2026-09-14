/**
 * Shared V4 capability execution runtime.
 * Selects + gates + executes registered capabilities.
 * Does NOT interpret language, resolve names, compute finance, or authorize identity.
 */

import type { ResolvedTaskResult } from '../resolver/types'
import { WeddingFinanceCapabilityError } from './finance/weddingFinanceCapability'
import { CapabilityDomainError } from './errors'
import {
  defaultCapabilitySelectionContext,
  selectCapabilityFromRegistry,
  selectV4Capability,
} from './selector'
import type {
  CapabilityDefinition,
  CapabilityDispatchResult,
  CapabilityExecutionResult,
  CapabilityRuntime,
  CapabilitySelectionContext,
} from './types'

export function createCapabilityRuntime(): CapabilityRuntime {
  return {
    nowMs: () => Date.now(),
  }
}

function emptyTiming(selectionMs: number, executionMs = 0) {
  return { selectionMs, executionMs }
}

async function executeSelected(input: {
  capability: CapabilityDefinition
  task: import('../resolver/types').ResolvedTask
  enabled: boolean
  context: CapabilitySelectionContext
  runtime: CapabilityRuntime
  selectionMs: number
}): Promise<CapabilityExecutionResult> {
  const { capability, task, enabled, context, runtime, selectionMs } = input

  if (!enabled) {
    return {
      status: 'disabled',
      capabilityId: capability.id,
      safeCode: 'capability_disabled',
      ...emptyTiming(selectionMs),
    }
  }

  const built = capability.buildInput(task, context)
  if (!built.ok) {
    if (
      built.reason === 'needs_clarification' ||
      built.reason === 'missing_wedding_id' ||
      built.reason === 'wedding_resource_required'
    ) {
      return {
        status: 'needs_clarification',
        missingSlot: built.missingSlot ?? 'resource',
        safeCode: built.safeCode,
        ...emptyTiming(selectionMs),
      }
    }
    return {
      status: 'unsupported',
      safeCode: built.safeCode,
      ...emptyTiming(selectionMs),
    }
  }

  const execStarted = runtime.nowMs()
  try {
    const observation = await capability.execute(built.input, runtime)
    return {
      status: 'success',
      capabilityId: capability.id,
      observation,
      selectionMs,
      executionMs: runtime.nowMs() - execStarted,
    }
  } catch (err) {
    const executionMs = runtime.nowMs() - execStarted
    if (
      err instanceof CapabilityDomainError ||
      err instanceof WeddingFinanceCapabilityError
    ) {
      if (err.executionStatus === 'not_found') {
        return {
          status: 'not_found',
          safeCode: err.safeCode,
          capabilityId: capability.id,
          selectionMs,
          executionMs,
        }
      }
      if (err.executionStatus === 'needs_clarification') {
        return {
          status: 'needs_clarification',
          missingSlot: err.missingSlot ?? 'resource',
          safeCode: err.safeCode,
          selectionMs,
          executionMs,
        }
      }
      return {
        status: 'error',
        safeCode: err.safeCode,
        capabilityId: capability.id,
        selectionMs,
        executionMs,
      }
    }
    return {
      status: 'error',
      safeCode: 'capability_execution_failed',
      capabilityId: capability.id,
      selectionMs,
      executionMs,
    }
  }
}

/**
 * Run selection + execution against the production registry.
 */
export async function runV4CapabilityExecution(
  resolution: ResolvedTaskResult | null | undefined,
  options?: {
    context?: CapabilitySelectionContext
    runtime?: CapabilityRuntime
    capabilities?: readonly CapabilityDefinition[]
  },
): Promise<CapabilityDispatchResult> {
  const context =
    options?.context ?? defaultCapabilitySelectionContext()
  const runtime = options?.runtime ?? createCapabilityRuntime()
  const selectStarted = runtime.nowMs()

  const selection = options?.capabilities
    ? selectCapabilityFromRegistry(resolution, options.capabilities, context)
    : selectV4Capability(resolution, context)
  const selectionMs = runtime.nowMs() - selectStarted

  switch (selection.status) {
    case 'no_match':
      return { handled: false, reason: selection.reason }
    case 'requires_discovery':
    case 'unsupported':
    case 'invalid_context':
      // Preserve Phase 3A: unrelated resolution statuses → silent skip.
      return { handled: false, reason: selection.safeCode }
    case 'conflict':
      return {
        handled: true,
        result: {
          status: 'conflict',
          safeCode: 'capability_match_conflict',
          matchedIds: selection.matchedIds,
          ...emptyTiming(selectionMs),
        },
      }
    case 'needs_clarification':
      // Preserve Phase 3A: resolver clarification becomes a handled control result.
      return {
        handled: true,
        result: {
          status: 'needs_clarification',
          missingSlot: selection.missingSlot,
          safeCode: selection.safeCode,
          ...emptyTiming(selectionMs),
        },
      }
    case 'selected':
      return {
        handled: true,
        result: await executeSelected({
          capability: selection.capability,
          task: selection.task,
          enabled: selection.enabled,
          context,
          runtime,
          selectionMs,
        }),
      }
    default: {
      const _exhaustive: never = selection
      return _exhaustive
    }
  }
}

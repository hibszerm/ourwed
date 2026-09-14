/**
 * Deterministic capability selector — no planner LLM.
 * 0 matches → no_match / resolution passthrough
 * 1 match → selected
 * >1 matches → fail closed (conflict)
 */

import type { ResolvedTaskResult } from '../resolver/types'
import { isV4CapabilityEnabled } from './availability'
import { V4_CAPABILITY_REGISTRY } from './registry'
import type {
  CapabilityDefinition,
  CapabilitySelection,
  CapabilitySelectionContext,
} from './types'

export function defaultCapabilitySelectionContext(): CapabilitySelectionContext {
  return { isCapabilityEnabled: isV4CapabilityEnabled }
}

/**
 * Select from an explicit capability list (production registry or test doubles).
 */
export function selectCapabilityFromRegistry(
  resolution: ResolvedTaskResult | null | undefined,
  capabilities: readonly CapabilityDefinition[],
  context: CapabilitySelectionContext = defaultCapabilitySelectionContext(),
): CapabilitySelection {
  if (!resolution) {
    return { status: 'no_match', reason: 'no_resolution' }
  }

  if (resolution.status === 'needs_clarification') {
    // Finance-shaped clarification: surface so shadow can record it.
    // Non-finance clarifications are still "no_match" for execution skip.
    return {
      status: 'needs_clarification',
      missingSlot:
        resolution.missingSlot === 'resource' ||
        resolution.missingSlot === 'participant' ||
        resolution.missingSlot === 'subject'
          ? resolution.missingSlot
          : 'other',
      safeCode: resolution.reason ?? 'needs_clarification',
    }
  }
  if (resolution.status === 'requires_discovery') {
    return { status: 'requires_discovery', safeCode: 'requires_discovery' }
  }
  if (resolution.status === 'unsupported') {
    return { status: 'unsupported', safeCode: 'unsupported' }
  }
  if (resolution.status === 'invalid_context') {
    return { status: 'invalid_context', safeCode: 'invalid_context' }
  }
  if (resolution.status !== 'resolved') {
    return { status: 'no_match', reason: 'not_resolved' }
  }

  const task = resolution
  const matches = capabilities.filter((cap) => cap.canHandle(task, context))

  if (matches.length === 0) {
    return { status: 'no_match', reason: 'no_capability_match' }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      safeCode: 'capability_match_conflict',
      matchedIds: matches.map((m) => m.id),
    }
  }

  const capability = matches[0]!
  return {
    status: 'selected',
    capability,
    task,
    enabled: context.isCapabilityEnabled(capability.id),
  }
}

export function selectV4Capability(
  resolution: ResolvedTaskResult | null | undefined,
  context: CapabilitySelectionContext = defaultCapabilitySelectionContext(),
): CapabilitySelection {
  return selectCapabilityFromRegistry(
    resolution,
    V4_CAPABILITY_REGISTRY,
    context,
  )
}

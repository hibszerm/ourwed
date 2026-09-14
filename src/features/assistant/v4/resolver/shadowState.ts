/**
 * Shadow-only session store for previous TaskSpec / V4 context.
 * Never feeds V3 WorkingContext. Cleared on Assistant close.
 *
 * Phase 3C: lastCapabilityExecution replaces finance-only field
 * (no per-domain lastPlace/lastTime stores).
 */

import type { AssistantTaskSpec } from '../taskSpec'
import { summarizeTaskSpec } from '../taskSpec'
import { capabilityResultToFinanceExecution } from '../capabilities/adaptFinanceResult'
import { consumeCollectionQueryExecutionExtras } from '../capabilities/collection/collectionQueryCapability'
import type { CapabilityExecutionResult } from '../capabilities/types'
import { domainQueryToLegacyFilters } from '../domainQuery/domainQueryToLegacyFilters'
import type { V4FinanceExecutionResult } from '../execution/financeTypes'
import type { V4ShadowContext } from './types'
import { emptyV4ShadowContext } from './types'
import type { ResolvedTaskResult } from './types'

type ShadowSession = {
  previousTaskSpec: AssistantTaskSpec | null
  lastResolution: ResolvedTaskResult | null
  lastCapabilityExecution: CapabilityExecutionResult | null
  contextOverlay: Partial<V4ShadowContext>
}

let session: ShadowSession = {
  previousTaskSpec: null,
  lastResolution: null,
  lastCapabilityExecution: null,
  contextOverlay: {},
}

export function clearAssistantV4ShadowSession(): void {
  session = {
    previousTaskSpec: null,
    lastResolution: null,
    lastCapabilityExecution: null,
    contextOverlay: {},
  }
}

export function getAssistantV4ShadowPreviousTask(): AssistantTaskSpec | null {
  return session.previousTaskSpec
}

export function getAssistantV4LastCapabilityExecution(): CapabilityExecutionResult | null {
  return session.lastCapabilityExecution
}

/** Finance-shaped view of last capability execution (Phase 3A compat). */
export function getAssistantV4LastFinanceExecution(): V4FinanceExecutionResult | null {
  const last = session.lastCapabilityExecution
  if (!last) return null
  if (last.status === 'success') {
    if (last.observation.kind !== 'money') return null
    return capabilityResultToFinanceExecution(last)
  }
  if (last.status === 'disabled') return null
  if (
    (last.status === 'not_found' || last.status === 'error') &&
    last.capabilityId &&
    last.capabilityId !== 'wedding.finance.get'
  ) {
    return null
  }
  if (
    last.status === 'needs_clarification' ||
    last.status === 'unsupported' ||
    last.status === 'conflict' ||
    last.status === 'not_found' ||
    last.status === 'error'
  ) {
    return capabilityResultToFinanceExecution(last)
  }
  return null
}

export function getAssistantV4ShadowSessionSnapshot(): {
  previousTaskSpec: AssistantTaskSpec | null
  lastResolution: ResolvedTaskResult | null
  lastCapabilityExecution: CapabilityExecutionResult | null
  /** @deprecated Phase 3A name — mirrors finance view of lastCapabilityExecution */
  lastFinanceExecution: V4FinanceExecutionResult | null
  contextOverlay: Partial<V4ShadowContext>
} {
  return {
    previousTaskSpec: session.previousTaskSpec,
    lastResolution: session.lastResolution,
    lastCapabilityExecution: session.lastCapabilityExecution,
    lastFinanceExecution: getAssistantV4LastFinanceExecution(),
    contextOverlay: { ...session.contextOverlay },
  }
}

/**
 * Provisional shadow state transition after interpret+resolve.
 * Updates previousTaskSpec for next turn only.
 */
export function applyAssistantV4ShadowTransition(input: {
  taskSpec: AssistantTaskSpec
  resolution: ResolvedTaskResult
  capabilityExecution?: CapabilityExecutionResult | null
  /** @deprecated use capabilityExecution */
  financeExecution?: V4FinanceExecutionResult | null
}): void {
  session.lastResolution = input.resolution
  if (input.capabilityExecution !== undefined) {
    session.lastCapabilityExecution = input.capabilityExecution
  } else if (input.financeExecution !== undefined) {
    // Phase 3A.1 tests still pass financeExecution — wrap as capability-shaped control.
    const fin = input.financeExecution
    if (fin == null) {
      session.lastCapabilityExecution = null
    } else if (fin.status === 'success') {
      session.lastCapabilityExecution = {
        status: 'success',
        capabilityId: 'wedding.finance.get',
        observation: {
          kind: 'money',
          resource: { kind: 'wedding', id: fin.weddingId },
          metric: fin.metric,
          amount: fin.amount,
          currency: fin.currency,
          displayName: fin.displayName,
        },
        selectionMs: 0,
        executionMs: 0,
      }
    } else if (fin.status === 'needs_clarification') {
      session.lastCapabilityExecution = {
        status: 'needs_clarification',
        missingSlot: fin.missingSlot,
        safeCode: fin.safeCode,
        selectionMs: 0,
        executionMs: 0,
      }
    } else if (fin.status === 'not_found') {
      session.lastCapabilityExecution = {
        status: 'not_found',
        safeCode: fin.safeCode,
        capabilityId: 'wedding.finance.get',
        selectionMs: 0,
        executionMs: 0,
      }
    } else if (fin.status === 'unsupported') {
      session.lastCapabilityExecution = {
        status: 'unsupported',
        safeCode: fin.safeCode,
        selectionMs: 0,
        executionMs: 0,
      }
    } else {
      session.lastCapabilityExecution = {
        status: 'error',
        safeCode: fin.safeCode,
        capabilityId: 'wedding.finance.get',
        selectionMs: 0,
        executionMs: 0,
      }
    }
  }

  if (input.resolution.status === 'resolved') {
    session.previousTaskSpec = input.resolution.mergedTaskSpec
    if (input.resolution.participant) {
      session.contextOverlay.activeParticipant = input.resolution.participant
    }
    if (input.resolution.resource) {
      session.contextOverlay.activeResource = input.resolution.resource
    }
    if (input.resolution.sequence) {
      session.contextOverlay.sequenceCursor = input.resolution.sequence
    }
    // G4: collection.query success — activeCollection identity from DomainQuery when present.
    if (
      input.capabilityExecution?.status === 'success' &&
      input.capabilityExecution.capabilityId === 'collection.query'
    ) {
      const extras = consumeCollectionQueryExecutionExtras()
      if (extras) {
        const query = extras.activeCollection.query
        // G5: filters are always derived from DomainQuery when present.
        const filters = query
          ? domainQueryToLegacyFilters(query)
          : extras.activeCollection.filters
        session.contextOverlay.activeCollection = {
          resource: extras.activeCollection.resource,
          label: extras.activeCollection.label,
          query,
          filters,
          memberIds: extras.activeCollection.memberIds,
          resultCount: extras.activeCollection.resultCount,
        }
        if (extras.activeResource) {
          session.contextOverlay.activeResource = extras.activeResource
        }
        if (filters?.dateRange) {
          session.contextOverlay.temporalAnchor = {
            phrase: session.contextOverlay.temporalAnchor?.phrase ?? null,
            from: filters.dateRange.from,
            to: filters.dateRange.to,
          }
        }
      }
    }
    return
  }

  if (
    input.taskSpec.op !== 'correction' &&
    input.taskSpec.op !== 'unsupported' &&
    input.resolution.status !== 'invalid_context'
  ) {
    session.previousTaskSpec = input.taskSpec
  }
}

export function mergeShadowOverlay(base: V4ShadowContext): V4ShadowContext {
  const overlay = session.contextOverlay
  return {
    ...emptyV4ShadowContext(),
    ...base,
    activeResource: overlay.activeResource ?? base.activeResource,
    activeParticipant: overlay.activeParticipant ?? base.activeParticipant,
    activeCollection: overlay.activeCollection ?? base.activeCollection,
    temporalAnchor: overlay.temporalAnchor ?? base.temporalAnchor,
    sequenceCursor: overlay.sequenceCursor ?? base.sequenceCursor,
    previousTaskSpec: session.previousTaskSpec ?? base.previousTaskSpec,
    candidates: base.candidates,
  }
}

export function previousTaskSummaryForInterpreter() {
  return summarizeTaskSpec(session.previousTaskSpec)
}

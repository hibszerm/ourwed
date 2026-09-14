/**
 * Phase 3B — wedding.finance.get capability.
 * Thin wrap of Phase 3A eligibility + commercial SoT loader.
 */

import {
  isPhase3AFinanceShapedTask,
  mapSubjectToFinanceMetric,
  selectPhase3AFinanceTask,
} from '../../execution/financeEligibility'
import { loadWeddingFinanceMetric } from '../../execution/executeSingleWeddingFinance'
import type { MoneyObservation } from '../../observations/types'
import type { ResolvedTask } from '../../resolver/types'
import type {
  CapabilityBuildInputResult,
  CapabilityDefinition,
  WeddingFinanceGetInput,
} from '../types'

/** Domain execution failure surfaced to the shared runtime (no raw exceptions). */
export class WeddingFinanceCapabilityError extends Error {
  readonly safeCode: string
  readonly executionStatus: 'not_found' | 'needs_clarification' | 'error'
  readonly missingSlot?: 'resource' | 'participant' | 'subject' | 'other'

  constructor(input: {
    safeCode: string
    executionStatus: 'not_found' | 'needs_clarification' | 'error'
    missingSlot?: 'resource' | 'participant' | 'subject' | 'other'
  }) {
    super(input.safeCode)
    this.name = 'WeddingFinanceCapabilityError'
    this.safeCode = input.safeCode
    this.executionStatus = input.executionStatus
    this.missingSlot = input.missingSlot
  }
}

function canHandleWeddingFinance(resolved: ResolvedTask): boolean {
  // Match finance-shaped tasks even when resource binding is incomplete
  // so buildInput can return needs_clarification (Phase 3A behavior).
  return isPhase3AFinanceShapedTask(resolved)
}

function buildWeddingFinanceInput(
  resolved: ResolvedTask,
): CapabilityBuildInputResult {
  const selected = selectPhase3AFinanceTask(resolved)
  if (!selected.eligible) {
    if (
      selected.reason === 'needs_clarification' ||
      selected.reason === 'wedding_resource_required' ||
      selected.reason === 'missing_wedding_id'
    ) {
      return {
        ok: false,
        reason:
          selected.reason === 'needs_clarification'
            ? 'needs_clarification'
            : selected.reason === 'missing_wedding_id'
              ? 'missing_wedding_id'
              : 'wedding_resource_required',
        missingSlot: 'resource',
        safeCode: selected.reason,
      }
    }
    return {
      ok: false,
      reason: 'invalid_input',
      safeCode: selected.reason,
    }
  }

  const metric =
    selected.metric ?? mapSubjectToFinanceMetric(selected.task.subject)
  if (!metric || selected.task.resource?.kind !== 'wedding') {
    return {
      ok: false,
      reason: 'invalid_input',
      safeCode: 'finance_input_invalid',
    }
  }

  const input: WeddingFinanceGetInput = {
    weddingId: selected.task.resource.id.trim(),
    metric,
  }
  return { ok: true, input }
}

export const weddingFinanceGetCapability: CapabilityDefinition = {
  id: 'wedding.finance.get',
  kind: 'read',
  resource: 'wedding',
  description:
    'Read canonical contract_value / paid / remaining for one owned wedding.',
  riskLevel: 'low',
  requiresConfirmation: false,
  canHandle: (resolved) => canHandleWeddingFinance(resolved),
  buildInput: (resolved) => buildWeddingFinanceInput(resolved),
  async execute(input): Promise<MoneyObservation> {
    const financeInput = input as WeddingFinanceGetInput
    const result = await loadWeddingFinanceMetric(financeInput)

    if (result.status === 'success') {
      return {
        kind: 'money',
        resource: { kind: 'wedding', id: result.weddingId },
        metric: result.metric,
        amount: result.amount,
        currency: result.currency,
        displayName: result.displayName,
      }
    }

    if (result.status === 'not_found') {
      throw new WeddingFinanceCapabilityError({
        safeCode: result.safeCode,
        executionStatus: 'not_found',
      })
    }
    if (result.status === 'needs_clarification') {
      throw new WeddingFinanceCapabilityError({
        safeCode: result.safeCode,
        executionStatus: 'needs_clarification',
        missingSlot: result.missingSlot,
      })
    }
    throw new WeddingFinanceCapabilityError({
      safeCode: result.safeCode,
      executionStatus: 'error',
    })
  },
}

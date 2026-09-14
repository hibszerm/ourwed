/**
 * Phase 3C — wedding.day_plan.get
 * Single-wedding time fact via operational day-plan SoT.
 * Sequence/next-stage and invented end-time are out of scope.
 */

import { placeRoleForParticipant } from '../../../api/participants'
import type { TimeFactRole, TimeObservation } from '../../observations/types'
import type { ResolvedTask } from '../../resolver/types'
import type { TaskOperation, TaskSubject } from '../../taskSpec'
import { CapabilityDomainError } from '../errors'
import { loadOperationalWeddingDay } from '../loadOperationalWeddingDay'
import type {
  CapabilityBuildInputResult,
  CapabilityDefinition,
  WeddingDayPlanGetInput,
} from '../types'

const TIME_OPS = new Set<TaskOperation>(['get_time'])
const TIME_SUBJECTS = new Set<TaskSubject>([
  'preparations',
  'ceremony',
  'reception',
])

export function isWeddingDayPlanShapedTask(task: ResolvedTask): boolean {
  if (!TIME_OPS.has(task.op)) return false
  if (task.collection) return false
  if (!task.subject || !TIME_SUBJECTS.has(task.subject)) return false
  return true
}

function participantKeyFromTask(
  task: ResolvedTask,
): 'p1' | 'p2' | null {
  const key = task.participant?.key?.trim()
  if (key === 'p1' || key === 'p2') return key
  return null
}

function buildDayPlanInput(resolved: ResolvedTask): CapabilityBuildInputResult {
  if (!isWeddingDayPlanShapedTask(resolved)) {
    return {
      ok: false,
      reason: 'invalid_input',
      safeCode: 'day_plan_not_shaped',
    }
  }
  if (!resolved.resource || resolved.resource.kind !== 'wedding') {
    return {
      ok: false,
      reason: 'wedding_resource_required',
      missingSlot: 'resource',
      safeCode: 'wedding_resource_required',
    }
  }
  if (!resolved.resource.id.trim()) {
    return {
      ok: false,
      reason: 'missing_wedding_id',
      missingSlot: 'resource',
      safeCode: 'missing_wedding_id',
    }
  }
  const input: WeddingDayPlanGetInput = {
    weddingId: resolved.resource.id.trim(),
    timeRole: resolved.subject as TimeFactRole,
    participantKey: participantKeyFromTask(resolved),
  }
  return { ok: true, input }
}

export const weddingDayPlanGetCapability: CapabilityDefinition = {
  id: 'wedding.day_plan.get',
  kind: 'read',
  resource: 'wedding',
  description:
    'Read preparations / ceremony / reception time for one owned wedding.',
  riskLevel: 'low',
  requiresConfirmation: false,
  canHandle: (resolved) => isWeddingDayPlanShapedTask(resolved),
  buildInput: (resolved) => buildDayPlanInput(resolved),
  async execute(input): Promise<TimeObservation> {
    const timeInput = input as WeddingDayPlanGetInput
    const loaded = await loadOperationalWeddingDay(timeInput.weddingId)
    if (loaded.status === 'not_found') {
      throw new CapabilityDomainError({
        safeCode: 'wedding_not_found',
        executionStatus: 'not_found',
      })
    }
    if (loaded.status === 'error') {
      throw new CapabilityDomainError({
        safeCode: loaded.safeCode,
        executionStatus: 'error',
      })
    }

    const { slots, weddingId, displayName } = loaded

    if (timeInput.timeRole === 'ceremony' || timeInput.timeRole === 'reception') {
      const slot = slots.find((s) => s.role === timeInput.timeRole)
      return {
        kind: 'time',
        resource: { kind: 'wedding', id: weddingId },
        role: timeInput.timeRole,
        participantKey: null,
        time: slot?.time ?? null,
        displayName,
      }
    }

    // preparations
    if (timeInput.participantKey) {
      const domainRole = placeRoleForParticipant(timeInput.participantKey)
      const slot = slots.find((s) => s.role === domainRole)
      return {
        kind: 'time',
        resource: { kind: 'wedding', id: weddingId },
        role: 'preparations',
        participantKey: timeInput.participantKey,
        time: slot?.time ?? null,
        displayName,
      }
    }

    // Unscoped preparations: earliest set prep time, else null (honest missing).
    const bride = slots.find((s) => s.role === 'bride_preparation')
    const groom = slots.find((s) => s.role === 'groom_preparation')
    const times = [bride?.time ?? null, groom?.time ?? null].filter(
      (t): t is string => Boolean(t && t.trim()),
    )
    times.sort()
    return {
      kind: 'time',
      resource: { kind: 'wedding', id: weddingId },
      role: 'preparations',
      participantKey: null,
      time: times[0] ?? null,
      displayName,
    }
  },
}

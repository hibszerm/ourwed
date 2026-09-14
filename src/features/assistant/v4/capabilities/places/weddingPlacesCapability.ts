/**
 * Phase 3C — wedding.places.get
 * Single-wedding place fact via operational day-plan SoT.
 */

import { placeRoleForParticipant } from '../../../api/participants'
import type { PlaceFactRole, PlaceObservation } from '../../observations/types'
import type { ResolvedTask } from '../../resolver/types'
import type { TaskOperation, TaskSubject } from '../../taskSpec'
import { CapabilityDomainError } from '../errors'
import { loadOperationalWeddingDay } from '../loadOperationalWeddingDay'
import type {
  CapabilityBuildInputResult,
  CapabilityDefinition,
  WeddingPlacesGetInput,
} from '../types'

const PLACE_OPS = new Set<TaskOperation>(['get_location'])
const PLACE_SUBJECTS = new Set<TaskSubject>([
  'preparations',
  'ceremony',
  'reception',
])

export function isWeddingPlacesShapedTask(task: ResolvedTask): boolean {
  if (!PLACE_OPS.has(task.op)) return false
  if (task.collection) return false
  if (!task.subject || !PLACE_SUBJECTS.has(task.subject)) return false
  return true
}

function participantKeyFromTask(
  task: ResolvedTask,
): 'p1' | 'p2' | null {
  const key = task.participant?.key?.trim()
  if (key === 'p1' || key === 'p2') return key
  return null
}

function buildPlacesInput(resolved: ResolvedTask): CapabilityBuildInputResult {
  if (!isWeddingPlacesShapedTask(resolved)) {
    return { ok: false, reason: 'invalid_input', safeCode: 'places_not_shaped' }
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
  const placeRole = resolved.subject as PlaceFactRole
  const input: WeddingPlacesGetInput = {
    weddingId: resolved.resource.id.trim(),
    placeRole,
    participantKey: participantKeyFromTask(resolved),
  }
  return { ok: true, input }
}

function slotSet(name: string | null, address: string | null): boolean {
  return Boolean((name && name.trim()) || (address && address.trim()))
}

export const weddingPlacesGetCapability: CapabilityDefinition = {
  id: 'wedding.places.get',
  kind: 'read',
  resource: 'wedding',
  description:
    'Read preparations / ceremony / reception place for one owned wedding.',
  riskLevel: 'low',
  requiresConfirmation: false,
  canHandle: (resolved) => isWeddingPlacesShapedTask(resolved),
  buildInput: (resolved) => buildPlacesInput(resolved),
  async execute(input): Promise<PlaceObservation> {
    const placesInput = input as WeddingPlacesGetInput
    const loaded = await loadOperationalWeddingDay(placesInput.weddingId)
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

    if (placesInput.placeRole === 'ceremony' || placesInput.placeRole === 'reception') {
      const slot = slots.find((s) => s.role === placesInput.placeRole)
      const name = slot?.name ?? null
      const address = slot?.address ?? null
      return {
        kind: 'place',
        resource: { kind: 'wedding', id: weddingId },
        role: placesInput.placeRole,
        participantKey: null,
        label: slot?.label ?? null,
        name,
        address,
        set: slotSet(name, address),
        displayName,
      }
    }

    // preparations
    if (placesInput.participantKey) {
      const domainRole = placeRoleForParticipant(placesInput.participantKey)
      const slot = slots.find((s) => s.role === domainRole)
      const name = slot?.name ?? null
      const address = slot?.address ?? null
      return {
        kind: 'place',
        resource: { kind: 'wedding', id: weddingId },
        role: 'preparations',
        participantKey: placesInput.participantKey,
        label: slot?.label ?? null,
        name,
        address,
        set: slotSet(name, address),
        displayName,
      }
    }

    const bride = slots.find((s) => s.role === 'bride_preparation')
    const groom = slots.find((s) => s.role === 'groom_preparation')
    const entries = [
      {
        participantKey: 'p1' as const,
        name: bride?.name ?? null,
        address: bride?.address ?? null,
        set: slotSet(bride?.name ?? null, bride?.address ?? null),
      },
      {
        participantKey: 'p2' as const,
        name: groom?.name ?? null,
        address: groom?.address ?? null,
        set: slotSet(groom?.name ?? null, groom?.address ?? null),
      },
    ]
    const anySet = entries.some((e) => e.set)
    return {
      kind: 'place',
      resource: { kind: 'wedding', id: weddingId },
      role: 'preparations',
      participantKey: null,
      label: 'Przygotowania',
      name: null,
      address: null,
      set: anySet,
      entries,
      displayName,
    }
  },
}

/**
 * DEV-only structured V3↔V4 place fact comparison (no prose).
 */

import type { AssistantResponse } from '../../types'
import type { PlaceObservation } from '../observations/types'
import type { CapabilityExecutionResult } from '../capabilities/types'

export type V4PlaceShadowComparison = {
  supported: boolean
  resolvedSameResource: boolean | null
  roleSame: boolean | null
  placeSame: boolean | null
  v4Status: CapabilityExecutionResult['status'] | 'skipped'
  v3Present: boolean
}

function normalizePlaceText(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function placeIdentityEqual(
  a: { name: string | null; address: string | null },
  b: { name: string | null; address: string | null },
): boolean {
  const an = normalizePlaceText(a.name)
  const aa = normalizePlaceText(a.address)
  const bn = normalizePlaceText(b.name)
  const ba = normalizePlaceText(b.address)
  if (an || bn) {
    if (an === bn) return true
  }
  if (aa || ba) {
    return aa === ba
  }
  // both unset
  return !an && !bn && !aa && !ba
}

function v3RoleMatchesObservation(
  focusRole: string | null | undefined,
  obs: PlaceObservation,
): boolean {
  if (!focusRole || focusRole === 'all') return true
  if (focusRole === obs.role) return true
  if (obs.role === 'preparations') {
    if (focusRole === 'bride_preparation' && obs.participantKey === 'p1') {
      return true
    }
    if (focusRole === 'groom_preparation' && obs.participantKey === 'p2') {
      return true
    }
    if (focusRole === 'preparations') return true
  }
  return focusRole === obs.role
}

export function compareV4PlaceWithV3Response(input: {
  v4: CapabilityExecutionResult | null
  v3: AssistantResponse | null | undefined
}): V4PlaceShadowComparison {
  const v4 = input.v4
  if (!v4) {
    return {
      supported: false,
      resolvedSameResource: null,
      roleSame: null,
      placeSame: null,
      v4Status: 'skipped',
      v3Present: false,
    }
  }

  if (input.v3?.kind !== 'places' || !input.v3.places) {
    return {
      supported: true,
      resolvedSameResource: null,
      roleSame: null,
      placeSame: null,
      v4Status: v4.status,
      v3Present: false,
    }
  }

  if (v4.status !== 'success' || v4.observation.kind !== 'place') {
    return {
      supported: true,
      resolvedSameResource: false,
      roleSame: false,
      placeSame: false,
      v4Status: v4.status,
      v3Present: true,
    }
  }

  const obs = v4.observation
  const weddingId = input.v3.wedding?.id ?? null
  const resolvedSameResource = weddingId === obs.resource.id
  const roleSame = v3RoleMatchesObservation(input.v3.focusRole, obs)

  const v3Places = input.v3.places
  const placeSame =
    obs.entries && obs.entries.length > 0
      ? obs.entries.every((entry) => {
          const match = v3Places.find(
            (p) =>
              (entry.participantKey === 'p1' &&
                (p.role === 'bride_preparation' ||
                  p.participantKey === 'p1')) ||
              (entry.participantKey === 'p2' &&
                (p.role === 'groom_preparation' ||
                  p.participantKey === 'p2')),
          )
          if (!match) return !entry.set
          return placeIdentityEqual(entry, {
            name: match.name,
            address: match.address,
          })
        })
      : (() => {
          const match =
            v3Places.find((p) => {
              if (obs.role === 'ceremony') return p.role === 'ceremony'
              if (obs.role === 'reception') return p.role === 'reception'
              if (obs.participantKey === 'p1') {
                return (
                  p.role === 'bride_preparation' || p.participantKey === 'p1'
                )
              }
              if (obs.participantKey === 'p2') {
                return (
                  p.role === 'groom_preparation' || p.participantKey === 'p2'
                )
              }
              return (
                p.role === 'bride_preparation' ||
                p.role === 'groom_preparation'
              )
            }) ?? v3Places[0]
          return match
            ? placeIdentityEqual(obs, {
                name: match.name,
                address: match.address,
              })
            : !obs.set
        })()

  return {
    supported: true,
    resolvedSameResource,
    roleSame,
    placeSame,
    v4Status: v4.status,
    v3Present: true,
  }
}

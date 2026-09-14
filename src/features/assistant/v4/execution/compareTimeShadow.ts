/**
 * DEV-only structured V3↔V4 time fact comparison (no prose).
 */

import type { AssistantResponse } from '../../types'
import type { TimeObservation } from '../observations/types'
import type { CapabilityExecutionResult } from '../capabilities/types'

export type V4TimeShadowComparison = {
  supported: boolean
  resolvedSameResource: boolean | null
  roleSame: boolean | null
  timeSame: boolean | null
  v4Status: CapabilityExecutionResult['status'] | 'skipped'
  v3Present: boolean
}

function normalizeTime(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim()
  const m = t.match(/^(\d{1,2})[.:](\d{2})$/)
  if (!m) return t || null
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
}

function timesEqual(a: string | null, b: string | null): boolean {
  return normalizeTime(a) === normalizeTime(b)
}

export function compareV4TimeWithV3Response(input: {
  v4: CapabilityExecutionResult | null
  v3: AssistantResponse | null | undefined
}): V4TimeShadowComparison {
  const v4 = input.v4
  if (!v4) {
    return {
      supported: false,
      resolvedSameResource: null,
      roleSame: null,
      timeSame: null,
      v4Status: 'skipped',
      v3Present: false,
    }
  }

  if (input.v3?.kind !== 'day_plan' || !input.v3.stops) {
    return {
      supported: true,
      resolvedSameResource: null,
      roleSame: null,
      timeSame: null,
      v4Status: v4.status,
      v3Present: false,
    }
  }

  if (v4.status !== 'success' || v4.observation.kind !== 'time') {
    return {
      supported: true,
      resolvedSameResource: false,
      roleSame: false,
      timeSame: false,
      v4Status: v4.status,
      v3Present: true,
    }
  }

  const obs = v4.observation as TimeObservation
  const weddingId = input.v3.wedding?.id ?? null
  const resolvedSameResource = weddingId === obs.resource.id

  const focus = input.v3.focus
  const roleSame =
    !focus ||
    focus === 'full' ||
    focus === obs.role ||
    (focus === 'preparations' && obs.role === 'preparations') ||
    (focus === 'ceremony' && obs.role === 'ceremony') ||
    (focus === 'earliest' && obs.time != null)

  const stops = input.v3.stops
  const match = stops.find((s) => {
    const role = s.role ?? ''
    if (obs.role === 'ceremony') return role === 'ceremony' || /ceremon/i.test(s.title)
    if (obs.role === 'reception') {
      return role === 'reception' || /przyj|wesel|sal/i.test(s.title)
    }
    if (obs.participantKey === 'p1') {
      return role === 'bride_preparation' || role === 'preparation'
    }
    if (obs.participantKey === 'p2') {
      return role === 'groom_preparation'
    }
    return (
      role === 'bride_preparation' ||
      role === 'groom_preparation' ||
      role === 'preparation' ||
      /przygotow/i.test(s.title)
    )
  })

  const timeSame = match
    ? timesEqual(obs.time, match.time)
    : obs.time == null

  return {
    supported: true,
    resolvedSameResource,
    roleSame,
    timeSame,
    v4Status: v4.status,
    v3Present: true,
  }
}

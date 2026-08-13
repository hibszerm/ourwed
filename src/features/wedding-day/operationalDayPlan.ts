/**
 * Shared operational day-plan builder.
 * Order comes from wedding_places.sort_order (via orderWeddingDayPlaces).
 * Times: studio override wins; questionnaire seeds missing values only.
 */

import { PLAN_DNIA_STAGE_LABELS } from '@/features/prewedding/answerSummary'
import { orderWeddingDayPlaces as getOperationalOrderedPlaces } from '@/features/travel/weddingDayRouteStops'
import { getTravelBaseAddress, getTravelBaseDisplayName } from '@/features/travel/travelUi'
import { distinctPlaceAndAddress } from '@/features/wedding-brief/briefNormalize'
import type { BriefTimelineItem } from '@/features/wedding-brief/types'
import type { StudioTravelSettings, WeddingPlace } from '@/types/travel'

export const STUDIO_STOP_KEY = 'studio'

export type OperationalTimeMap = Record<string, string>

export type OperationalDayStop = {
  key: string
  kind: 'studio' | 'wedding_place'
  role: string
  title: string
  placeName?: string
  address?: string
  time: string | null
  timeSource: 'studio' | 'questionnaire' | null
  latitude?: number | null
  longitude?: number | null
  placeId?: string | null
  reorderable: boolean
}

export function normalizeOperationalClock(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim()
  const m = t.match(/^(\d{1,2})[.:](\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function resolveStopTime(
  override: string | undefined,
  seed: string | null | undefined,
): { time: string | null; timeSource: OperationalDayStop['timeSource'] } {
  const studioTime = normalizeOperationalClock(override)
  if (studioTime) return { time: studioTime, timeSource: 'studio' }
  const questionnaireTime = normalizeOperationalClock(seed)
  if (questionnaireTime) return { time: questionnaireTime, timeSource: 'questionnaire' }
  return { time: null, timeSource: null }
}

export function questionnaireSeedTimeForRole(
  role: string,
  times: Partial<Record<string, string>>,
): string | null {
  if (role === 'ceremony') return times.ceremony ?? null
  if (role === 'reception') return times.reception ?? null
  return null
}

export function buildOperationalDayStops(input: {
  studio: StudioTravelSettings | null
  places: WeddingPlace[]
  operationalTimes?: OperationalTimeMap
  questionnaireTimes?: Partial<Record<string, string>>
}): OperationalDayStop[] {
  const times = input.operationalTimes ?? {}
  const qTimes = input.questionnaireTimes ?? {}
  const stops: OperationalDayStop[] = []

  if (input.studio) {
    const resolved = resolveStopTime(times[STUDIO_STOP_KEY], null)
    const name = getTravelBaseDisplayName(input.studio)
    const address = getTravelBaseAddress(input.studio)
    const distinct = distinctPlaceAndAddress(name, address || undefined)
    stops.push({
      key: STUDIO_STOP_KEY,
      kind: 'studio',
      role: 'studio',
      title: PLAN_DNIA_STAGE_LABELS.studio || 'Start dnia',
      placeName: distinct.placeName,
      address: distinct.shortAddress || address || undefined,
      time: resolved.time,
      timeSource: resolved.timeSource,
      latitude: input.studio.latitude,
      longitude: input.studio.longitude,
      placeId: input.studio.placeId,
      reorderable: false,
    })
  }

  for (const place of getOperationalOrderedPlaces(input.places)) {
    const role = place.role === 'preparation' ? 'bride_preparation' : place.role
    const resolved = resolveStopTime(
      times[place.id],
      questionnaireSeedTimeForRole(role, qTimes),
    )
    const distinct = distinctPlaceAndAddress(
      place.label || undefined,
      place.formattedAddress || undefined,
    )
    stops.push({
      key: place.id,
      kind: 'wedding_place',
      role,
      title: PLAN_DNIA_STAGE_LABELS[role] || role,
      placeName: distinct.placeName,
      address: distinct.shortAddress || place.formattedAddress || undefined,
      time: resolved.time,
      timeSource: resolved.timeSource,
      latitude: place.latitude,
      longitude: place.longitude,
      placeId: place.placeId,
      reorderable: true,
    })
  }

  return stops
}

/** Brief PLAN DNIA — wedding-place stops only, studio order preserved (not chronological). */
export function operationalStopsToBriefTimeline(
  stops: OperationalDayStop[],
): BriefTimelineItem[] {
  return stops
    .filter((s) => s.kind === 'wedding_place')
    .map((s) => ({
      time: s.time || '',
      title: s.title,
      placeName: s.placeName,
      shortAddress: s.address,
      untimed: !s.time,
    }))
}

export function reorderPlaceIds(
  currentIds: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= currentIds.length ||
    toIndex >= currentIds.length ||
    fromIndex === toIndex
  ) {
    return currentIds
  }
  const next = [...currentIds]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return currentIds
  next.splice(toIndex, 0, moved)
  return next
}

/** Exact semantic vendor identity — not substring (avoids "dj" matching "dj willy"). */
export function vendorIdentityKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function vendorNamesEqual(a: string, b: string): boolean {
  const ka = vendorIdentityKey(a)
  const kb = vendorIdentityKey(b)
  return Boolean(ka && kb && ka === kb)
}

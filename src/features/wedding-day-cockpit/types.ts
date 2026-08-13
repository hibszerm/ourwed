/**
 * Wedding Day Cockpit view model — projection of canonical domain data.
 */

import type { BriefContact, BriefNote } from '@/features/wedding-brief/types'
import type { TravelRouteUiStatus } from '@/features/travel/TravelRouteTotals'

export type CockpitRouteLeg = {
  durationText: string | null
  distanceText: string | null
  status: 'ok' | 'missing' | 'stale' | 'error'
}

export type CockpitStop = {
  key: string
  kind: 'studio' | 'wedding_place'
  role: string
  title: string
  placeName?: string
  address?: string
  time: string | null
  latitude?: number | null
  longitude?: number | null
  placeId?: string | null
  /** Hero/plan actionable wedding stops (not studio). */
  actionable: boolean
  completed: boolean
  /** Incoming leg from previous stop (null for first). */
  incomingLeg: CockpitRouteLeg | null
  phone?: string | null
}

export type CockpitSettlement = {
  contractValue: number
  totalPaid: number
  remainingToPay: number
  currency: string
  settled: boolean
  /** Compact travel fee line; null when unresolved / absent. */
  travelFeeLabel: string | null
} | null

export type WeddingDayCockpitData = {
  weddingId: string
  displayName: string
  dateLabel: string
  packageName: string | null
  stops: CockpitStop[]
  /** First incomplete actionable stop, or null when day finished / empty. */
  heroStopKey: string | null
  dayComplete: boolean
  criticalNotes: BriefNote[]
  contacts: BriefContact[]
  settlement: CockpitSettlement
  routeStatus: TravelRouteUiStatus
  routeFingerprint: string | null
}

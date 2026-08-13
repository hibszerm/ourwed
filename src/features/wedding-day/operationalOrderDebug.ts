/**
 * DEV-only diagnostics for operational day-plan order lifecycle.
 * No-ops in production builds.
 */

import type { WeddingPlace } from '@/types/travel'

export type OperationalOrderSource =
  | 'weddingPlaceService.reorder'
  | 'weddingPlaceService.upsert'
  | 'weddingPlaceService.listByWeddingId'
  | 'weddingPlaceService.syncCoreFromText'
  | 'travelService.getPlan'
  | 'travelService.recalculate'
  | 'orderWeddingDayPlaces'
  | 'buildOrderedWeddingDayRouteStops'
  | 'PreWeddingDayPlan'
  | 'WeddingDayWorkspace'
  | 'ReactQuery.travel-plan'
  | 'ReactQuery.wedding-places'
  | 'stale-plan-discard'
  | 'drag-commit'
  | 'db-readback'

function enabled(): boolean {
  try {
    const env = import.meta.env as { DEV?: boolean } | undefined
    return Boolean(env?.DEV)
  } catch {
    return false
  }
}

export function isOperationalOrderDebugEnabled(): boolean {
  return enabled()
}

export function summarizePlaceOrder(places: WeddingPlace[]): string {
  return places
    .map((p) => `${p.role}:${p.id.slice(0, 8)}@${p.sortOrder}`)
    .join(' → ')
}

export function summarizeIdRoles(
  entries: Array<{ id: string; role?: string; sortOrder?: number }>,
): string {
  return entries
    .map((e) => {
      const role = e.role ?? '?'
      const sort =
        e.sortOrder != null && Number.isFinite(e.sortOrder)
          ? `@${e.sortOrder}`
          : ''
      return `${role}:${e.id.slice(0, 8)}${sort}`
    })
    .join(' → ')
}

export function logOperationalOrder(input: {
  source: OperationalOrderSource
  weddingId: string
  places?: WeddingPlace[]
  note?: string
  queryKey?: unknown
  extra?: Record<string, unknown>
}): void {
  if (!enabled()) return
  const payload = {
    t: new Date().toISOString(),
    source: input.source,
    weddingId: input.weddingId,
    note: input.note,
    queryKey: input.queryKey,
    order: input.places ? summarizePlaceOrder(input.places) : undefined,
    roles: input.places?.map((p) => p.role),
    sortOrders: input.places?.map((p) => p.sortOrder),
    ...input.extra,
  }
  console.info('[operational-order]', payload)
}

/** DEV assertion: route input ids must match operational place ids in order. */
export function assertRouteInputMatchesOperationalOrder(input: {
  weddingId: string
  operationalPlaceIds: string[]
  routeStopIds: string[]
}): void {
  if (!enabled()) return
  const ops = input.operationalPlaceIds
  const routePlaces = input.routeStopIds.filter((id) => id !== 'studio')
  const same =
    ops.length === routePlaces.length &&
    ops.every((id, i) => id === routePlaces[i])
  if (!same) {
    console.error('[operational-order] ROUTE INPUT MISMATCH', {
      weddingId: input.weddingId,
      operationalPlaceIds: ops,
      routeStopIds: input.routeStopIds,
    })
  }
}

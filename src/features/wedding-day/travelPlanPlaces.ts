/**
 * Travel plan carries segments; wedding_places carry operational order.
 * Never let a stale travel-plan.places array become order authority.
 */

import type { TravelPlan, WeddingPlace } from '@/types/travel'

export function withAuthoritativePlaces(
  plan: TravelPlan,
  places: WeddingPlace[] | undefined | null,
): TravelPlan {
  if (!places || places.length === 0) return plan
  return { ...plan, places }
}

export function travelPlanQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['travel-plan', string | null | undefined, string] {
  return ['travel-plan', userId, weddingId] as const
}

export function weddingPlacesQueryKey(
  userId: string | null | undefined,
  weddingId: string,
): readonly ['wedding-places', string | null | undefined, string] {
  return ['wedding-places', userId, weddingId] as const
}

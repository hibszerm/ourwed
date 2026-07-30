/**
 * Shared Dashboard location label for Wedding + Session cards.
 */
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import type { Session } from '@/types/session'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

export const DASHBOARD_LOCATION_MISSING = 'Lokalizacja nieuzupełniona'

export type DashboardLocationLabel = {
  /** Compact primary line: "Venue, Town" or calm fallback. */
  primary: string
  venueName: string | null
  locality: string | null
  /** True when showing the missing-location fallback. */
  missing: boolean
}

export function getDashboardWeddingLocationLabel(
  wedding: Wedding,
  places?: WeddingPlace[] | null,
): DashboardLocationLabel {
  const summary = getWeddingPrimaryLocationSummary(wedding, places)
  if (summary.displayText) {
    return {
      primary: summary.displayText,
      venueName: summary.venueName,
      locality: summary.locality,
      missing: false,
    }
  }
  return {
    primary: DASHBOARD_LOCATION_MISSING,
    venueName: null,
    locality: null,
    missing: true,
  }
}

export function getDashboardSessionLocationLabel(
  session: Session,
): DashboardLocationLabel {
  const text = getSessionLocationSummary(session.location)
  if (text) {
    return {
      primary: text,
      venueName: session.location?.name?.trim() || null,
      locality: null,
      missing: false,
    }
  }
  return {
    primary: DASHBOARD_LOCATION_MISSING,
    venueName: null,
    locality: null,
    missing: true,
  }
}

export function getDashboardLocationLabel(
  entity: CalendarUiEvent,
  options?: { places?: WeddingPlace[] | null },
): DashboardLocationLabel {
  if (entity.entityType === 'wedding') {
    return getDashboardWeddingLocationLabel(entity.wedding, options?.places)
  }
  return getDashboardSessionLocationLabel(entity.session)
}

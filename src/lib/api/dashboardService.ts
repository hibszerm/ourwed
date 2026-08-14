import { resolveStudioUserId } from '@/lib/api/studioUser'
import { contractService } from '@/lib/api/contractService'
import {
  mapSessionRowToModel,
  type SessionRow,
} from '@/lib/api/sessionService'
import { taskService } from '@/lib/api/taskService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import {
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Session } from '@/types/session'
import type { Task, Wedding } from '@/types/wedding'

export interface DashboardData {
  todayTasks: Task[]
}

export interface DashboardAssignmentLists {
  weddings: Wedding[]
  sessions: Session[]
}

/**
 * Explicit wedding columns for Dashboard assignment cards.
 * No wildcard wedding/session selects. No payments / notes / timeline /
 * gallery / form-answer hydrate.
 */
export const DASHBOARD_LIGHT_WEDDING_SELECT =
  'id, user_id, bride_name, groom_name, display_name, email, phone, wedding_date, ceremony_time, venue, status, workflow_stage, package_name, package_id, contract_value, deposit_amount, currency, accent_color, bride_preparation_location, groom_preparation_location, created_at, updated_at'

/** Explicit session columns — no session_payments hydrate. */
export const DASHBOARD_LIGHT_SESSION_SELECT =
  'id, user_id, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type, session_date, start_time, end_time, location_name, location_address, formatted_address, place_id, latitude, longitude, location_source, total_price, deposit_amount, notes, linked_wedding_id, created_at, updated_at'

/** Light active-id query — no wedding hydrate. */
async function listActiveOwnedWeddingIds(): Promise<Set<string>> {
  const userId = await resolveStudioUserId()
  const { data, error } = await supabase
    .from('weddings')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')

  throwOnError(error)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

/**
 * Attach only what Dashboard cards need beyond wedding scalars:
 * - contract.status → business badge
 * - wedding_places → location label (batch, not N+1)
 */
async function enrichDashboardWeddings(
  weddings: Wedding[],
): Promise<Wedding[]> {
  if (weddings.length === 0) return []
  const ids = weddings.map((w) => w.id)
  const [contractsMap, placesMap] = await Promise.all([
    contractService.listByWeddingIds(ids),
    weddingPlaceService.listByWeddingIds(ids),
  ])
  return weddings.map((wedding) => {
    const withPlaces = applyWeddingPlaces(
      wedding,
      placesMap.get(wedding.id) ?? [],
    )
    return {
      ...withPlaces,
      contract: contractsMap.get(wedding.id) ?? { status: 'none' },
    }
  })
}

export const dashboardService = {
  /**
   * Dashboard-specific aggregates only.
   * Notifications use dedicated React Query hooks (latest + unread count).
   * Assignment cards use getAssignmentLists — never the full wedding hydrate path.
   */
  async getDashboardData(): Promise<DashboardData> {
    return withDevPerf('dashboard.getDashboardData', async () => {
      const [todayTasks, placesNeedingVerification, activeIds] =
        await Promise.all([
          taskService.listDueOn(new Date().toISOString().slice(0, 10)),
          weddingPlaceService.listNeedingVerification(),
          listActiveOwnedWeddingIds(),
        ])

      const today = new Date().toISOString().slice(0, 10)

      const unverifiedByWedding = new Map<string, number>()
      for (const place of placesNeedingVerification) {
        unverifiedByWedding.set(
          place.weddingId,
          (unverifiedByWedding.get(place.weddingId) ?? 0) + 1,
        )
      }

      const locationVerifyTasks: Task[] = [...unverifiedByWedding.entries()]
        .filter(([weddingId]) => activeIds.has(weddingId))
        .map(([weddingId, count]) => ({
          id: `verify-locations-${weddingId}`,
          weddingId,
          title:
            count === 1
              ? 'Verify wedding locations'
              : `Verify wedding locations (${count})`,
          dueDate: today,
          completed: false,
          priority: 'high' as const,
        }))

      return {
        todayTasks: [...locationVerifyTasks, ...todayTasks],
      }
    })
  },

  /**
   * Light assignment lists for Dashboard first paint.
   * Empty account → { weddings: [], sessions: [] } with ZERO inserts.
   */
  async getAssignmentLists(): Promise<DashboardAssignmentLists> {
    return withDevPerf('dashboard.getAssignmentLists', async () => {
      const userId = await resolveStudioUserId()

      const [weddingResult, sessionResult] = await Promise.all([
        supabase
          .from('weddings')
          .select(DASHBOARD_LIGHT_WEDDING_SELECT)
          .eq('user_id', userId)
          .order('wedding_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('sessions')
          .select(DASHBOARD_LIGHT_SESSION_SELECT)
          .eq('user_id', userId)
          .order('session_date', { ascending: true, nullsFirst: false }),
      ])

      throwOnError(weddingResult.error)
      throwOnError(sessionResult.error)

      const lightWeddings = ((weddingResult.data ?? []) as WeddingRow[]).map(
        mapWeddingRowToModel,
      )
      const sessions = ((sessionResult.data ?? []) as SessionRow[]).map(
        mapSessionRowToModel,
      )

      const weddings = await enrichDashboardWeddings(lightWeddings)
      return { weddings, sessions }
    })
  },
}

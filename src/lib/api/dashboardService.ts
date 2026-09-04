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
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { Session } from '@/types/session'
import type { Task, Wedding } from '@/types/wedding'

export interface DashboardData {
  todayTasks: Task[]
}

export interface DashboardAssignmentLists {
  weddings: Wedding[]
  sessions: Session[]
}

export interface NearestDeliveryDeadline {
  weddingId: string
  title: string
  weddingDate: string | null
  deliveryDueDate: string
  deliveryCompletedAt: null
  href: string
  createdAt: string
}

/**
 * Explicit wedding columns for Dashboard assignment cards.
 * No wildcard wedding/session selects. No payments / notes / timeline /
 * gallery / form-answer hydrate.
 */
export const DASHBOARD_LIGHT_WEDDING_SELECT =
  'id, user_id, bride_name, groom_name, display_name, email, phone, wedding_date, ceremony_time, venue, status, workflow_stage, package_name, package_id, contract_value, deposit_amount, currency, accent_color, bride_preparation_location, groom_preparation_location, created_at, updated_at'

const DASHBOARD_DELIVERY_DEADLINE_SELECT =
  'id, bride_name, groom_name, display_name, wedding_date, delivery_due_date, delivery_completed_at, created_at'

/** Explicit session columns — no session_payments hydrate. */
export const DASHBOARD_LIGHT_SESSION_SELECT =
  'id, user_id, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type, session_date, start_time, end_time, location_name, location_address, formatted_address, place_id, latitude, longitude, location_source, total_price, deposit_amount, notes, linked_wedding_id, created_at, updated_at'

/**
 * Attach only what Dashboard needs beyond wedding scalars:
 * - contract.status → Attention / assignment context (not a card badge)
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
   * Dashboard Dzisiaj card — incomplete manual tasks due on or before endDate.
   * Overdue + today (+ future through horizon). Excludes undated / done / cancelled.
   * Owner-scoped; no wedding hydration.
   */
  async getDashboardData(endDate?: string): Promise<DashboardData> {
    return withDevPerf('dashboard.getDashboardData', async () => {
      const through = (endDate ?? localCalendarDateKey()).slice(0, 10)
      const todayTasks = await taskService.listDueThrough(through)
      return { todayTasks }
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

  /**
   * Nearest active delivery deadlines for Dashboard.
   * Persisted due date only — never recompute from months/days here.
   */
  async getNearestDeliveryDeadlines(): Promise<NearestDeliveryDeadline[]> {
    return withDevPerf('dashboard.getNearestDeliveryDeadline', async () => {
      const userId = await resolveStudioUserId()
      const { data, error } = await supabase
        .from('weddings')
        .select(DASHBOARD_DELIVERY_DEADLINE_SELECT)
        .eq('user_id', userId)
        .not('delivery_due_date', 'is', null)
        .is('delivery_completed_at', null)
        .order('delivery_due_date', { ascending: true, nullsFirst: false })
        .order('wedding_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(3)

      throwOnError(error)

      const rows = (data ?? []) as WeddingRow[]
      return rows
        .map((row): NearestDeliveryDeadline | null => {
          if (!row?.id || !row.delivery_due_date) return null
          const wedding = mapWeddingRowToModel(row)
          return {
            weddingId: wedding.id,
            title: getWeddingDisplayName(wedding),
            weddingDate: wedding.date ?? null,
            deliveryDueDate: wedding.deliveryDueDate ?? row.delivery_due_date,
            deliveryCompletedAt: null,
            href: `/sluby/${wedding.id}`,
            createdAt: wedding.createdAt,
          }
        })
        .filter((row): row is NearestDeliveryDeadline => row !== null)
    })
  },
}

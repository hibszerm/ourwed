import { notificationService } from '@/lib/api/notificationService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { taskService } from '@/lib/api/taskService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Notification, Task } from '@/types/wedding'

export interface DashboardData {
  todayTasks: Task[]
  notifications: Notification[]
}

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

export const dashboardService = {
  /**
   * Dashboard-specific aggregates only.
   * Canonical wedding list comes from `['weddings', userId]` / useWeddings —
   * this must NOT full-hydrate weddings.
   */
  async getDashboardData(): Promise<DashboardData> {
    return withDevPerf('dashboard.getDashboardData', async () => {
      const [todayTasks, notifications, placesNeedingVerification, activeIds] =
        await Promise.all([
          taskService.listDueOn(new Date().toISOString().slice(0, 10)),
          notificationService.list(),
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
        notifications,
      }
    })
  },
}

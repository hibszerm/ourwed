import { calendarEventService } from '@/lib/api/calendarEventService'
import { notificationService } from '@/lib/api/notificationService'
import { taskService } from '@/lib/api/taskService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { getNearestUpcomingWedding } from '@/lib/utils/weddingMetrics'
import type { Deadline, Notification, Task, Wedding } from '@/types/wedding'

export interface DashboardData {
  nextWedding: Wedding | null
  todayTasks: Task[]
  notifications: Notification[]
  upcomingDeadlines: Deadline[]
}

export const dashboardService = {
  async getDashboardData(): Promise<DashboardData> {
    const [
      weddings,
      todayTasks,
      notifications,
      allTasks,
      calendarEvents,
      placesNeedingVerification,
    ] = await Promise.all([
      weddingService.getAll(),
      taskService.listDueOn(new Date().toISOString().slice(0, 10)),
      notificationService.list(),
      taskService.listAll(),
      calendarEventService.listAll(),
      weddingPlaceService.listNeedingVerification(),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const nextWedding = getNearestUpcomingWedding(weddings)

    const unverifiedByWedding = new Map<string, number>()
    for (const place of placesNeedingVerification) {
      unverifiedByWedding.set(
        place.weddingId,
        (unverifiedByWedding.get(place.weddingId) ?? 0) + 1,
      )
    }

    const activeWeddingIds = new Set(
      weddings.filter((w) => w.status === 'active').map((w) => w.id),
    )

    const locationVerifyTasks: Task[] = [...unverifiedByWedding.entries()]
      .filter(([weddingId]) => activeWeddingIds.has(weddingId))
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

    const upcomingDeadlines: Deadline[] = [
      ...allTasks
        .filter((t) => !t.completed && t.dueDate >= today)
        .slice(0, 8)
        .map((t) => ({
          id: `task-${t.id}`,
          weddingId: t.weddingId,
          title: t.title,
          date: t.dueDate,
          type: 'other' as const,
        })),
      ...calendarEvents
        .filter((e) => e.type === 'delivery' || e.type === 'meeting')
        .filter((e) => e.startDate.slice(0, 10) >= today)
        .slice(0, 8)
        .map((e) => ({
          id: `cal-${e.id}`,
          weddingId: e.weddingId,
          title: e.title,
          date: e.startDate.slice(0, 10),
          type:
            e.type === 'delivery'
              ? ('delivery' as const)
              : ('meeting' as const),
        })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8)

    return {
      nextWedding,
      todayTasks: [...locationVerifyTasks, ...todayTasks],
      notifications,
      upcomingDeadlines,
    }
  },
}

import { calendarEventService } from '@/lib/api/calendarEventService'
import { notificationService } from '@/lib/api/notificationService'
import { taskService } from '@/lib/api/taskService'
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
    const [weddings, todayTasks, notifications, allTasks, calendarEvents] =
      await Promise.all([
        weddingService.getAll(),
        taskService.listDueOn(new Date().toISOString().slice(0, 10)),
        notificationService.list(),
        taskService.listAll(),
        calendarEventService.listAll(),
      ])

    const today = new Date().toISOString().slice(0, 10)
    const nextWedding = getNearestUpcomingWedding(weddings)

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
      todayTasks,
      notifications,
      upcomingDeadlines,
    }
  },
}

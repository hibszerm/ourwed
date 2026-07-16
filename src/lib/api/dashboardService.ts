import { mockDeadlines } from '@/mocks/deadlines'
import { getNotifications } from '@/mocks/notifications'
import { getTasks } from '@/mocks/tasks'
import { weddingService } from '@/lib/api/weddingService'
import type { Deadline, Notification, Task, Wedding } from '@/types/wedding'

export interface DashboardData {
  nextWedding: Wedding | null
  todayTasks: Task[]
  notifications: Notification[]
  upcomingDeadlines: Deadline[]
}

export const dashboardService = {
  async getDashboardData(): Promise<DashboardData> {
    await delay(150)

    const weddings = await weddingService.getAll()
    const today = new Date().toISOString().slice(0, 10)

    const nextWedding = weddings.find((w) => new Date(w.date) >= new Date(today)) ?? null

    const todayTasks = getTasks().filter((t) => t.dueDate === today && !t.completed)

    const upcomingDeadlines = [...mockDeadlines]
      .filter((d) => new Date(d.date) >= new Date(today))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5)

    return {
      nextWedding,
      todayTasks,
      notifications: getNotifications(),
      upcomingDeadlines,
    }
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

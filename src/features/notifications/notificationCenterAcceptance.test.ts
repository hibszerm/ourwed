/**
 * Notification Center V1 — service, RQ, route, Dashboard/Sidebar wiring.
 * Run: npm run test:notification-center
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

// --- Service shape / pagination helpers ---
{
  const svc = read('src/lib/api/notificationService.ts')
  assertIncludes(svc, 'NOTIFICATION_PAGE_SIZE = 30', 'A — page size 30')
  assertIncludes(svc, 'NOTIFICATION_DASHBOARD_LATEST = 4', 'A — dashboard latest 4')
  assertIncludes(svc, 'async listPage', 'B — listPage')
  assertIncludes(svc, 'async listLatest', 'A — listLatest')
  assertIncludes(svc, 'async markAllRead', 'F — markAllRead')
  assertIncludes(svc, 'async markRead', 'E — markRead')
  assertIncludes(svc, 'async unreadCount', 'unread count')
  assertIncludes(svc, ".eq('user_id', userId)", 'G — owner filter')
  assertIncludes(svc, 'created_at.lt.', 'D — stable cursor clause')
  assertIncludes(svc, "order('id'", 'D — id tie-break')
  assertIncludes(svc, 'unreadOnly', 'C — unreadOnly')
  assertIncludes(svc, 'notificationCursorFromItem', 'D — cursor helper')
  assertIncludes(svc, 'createdAtIso:', 'iso mapped for cursor')
  assertNotIncludes(svc, 'notification_events', 'H — no events client path')
  assertNotIncludes(svc, 'notification_deliveries', 'H — no deliveries client path')
  assertIncludes(svc, ".eq('read', false)", 'markAll scopes unread')

  console.log('PASS  notification service')
}

// --- React Query / freshness ---
{
  const hooks = read('src/features/notifications/useNotifications.ts')
  assertIncludes(hooks, "NOTIFICATIONS_KEY = 'notifications'", 'list key')
  assertIncludes(
    hooks,
    "NOTIFICATIONS_UNREAD_COUNT_KEY = 'notifications-unread-count'",
    'unread key',
  )
  assertIncludes(hooks, 'staleTime: 0', 'staleTime 0')
  assertIncludes(hooks, "refetchOnMount: 'always'", 'refetchOnMount')
  assertIncludes(hooks, 'refetchOnWindowFocus: true', 'refetchOnFocus')
  assertIncludes(hooks, 'useUnreadNotificationCount', 'unread hook')
  assertIncludes(hooks, 'useLatestNotifications', 'latest hook')
  assertIncludes(hooks, 'useNotificationsInfinite', 'infinite list')
  assertIncludes(hooks, 'markAllRead', 'mark all mutation')

  const sidebar = read('src/layouts/Sidebar.tsx')
  assertIncludes(sidebar, 'useUnreadNotificationCount', 'Sidebar uses unread hook')
  assertNotIncludes(sidebar, 'setUnreadCount', 'no local unread setter')
  assertNotIncludes(sidebar, "from '@/lib/api/notificationService'", 'no direct service')

  const card = read('src/features/dashboard/components/NotificationsCard.tsx')
  assertIncludes(card, 'useLatestNotifications', 'Dashboard uses latest hook')
  assertIncludes(card, 'useUnreadNotificationCount', 'Dashboard uses unread hook')

  const dash = read('src/lib/api/dashboardService.ts')
  assertNotIncludes(dash, 'notificationService', 'dashboard aggregate has no notifications')

  console.log('PASS  notification React Query')
}

// --- UI / routes ---
{
  const router = read('src/routes/router.tsx')
  assertIncludes(router, "path: '/powiadomienia'", 'A — route')
  assertIncludes(router, 'NotificationsPage', 'A — page import')
  assertIncludes(router, "path: '/ustawienia/powiadomienia'", 'settings prefs preserved')

  const page = read('src/pages/NotificationsPage.tsx')
  assertIncludes(page, "useState<NotificationListFilter>('all')", 'B — all default')
  assertIncludes(page, "setFilter('unread')", 'C — unread filter')
  assertIncludes(page, 'styles.unread', 'D — unread style')
  assertIncludes(page, 'styles.dot', 'D — unread dot')
  assertIncludes(page, 'markRead.mutateAsync', 'E/F — mark read')
  assertIncludes(page, 'navigate(notification.link)', 'E — navigate when link')
  assertIncludes(page, 'markAll.mutateAsync', 'G — mark all')
  assertIncludes(page, 'fetchNextPage', 'H — load more')
  assertIncludes(page, 'Pokaż więcej', 'H — load more label')
  assertIncludes(page, 'Nie masz jeszcze żadnych powiadomień', 'I — empty all')
  assertIncludes(page, 'Wszystko przeczytane', 'J — empty unread')
  assertIncludes(
    page,
    'Boolean(notification.link) || !notification.read',
    'F — link-less actionable',
  )

  const card = read('src/features/dashboard/components/NotificationsCard.tsx')
  assertIncludes(card, 'Zobacz wszystkie', 'L/M — see all')
  assertIncludes(card, 'to="/powiadomienia"', 'M — see all href')
  assertIncludes(card, 'NOTIFICATION_DASHBOARD_LATEST', 'L — latest 4 constant')

  const sidebar = read('src/layouts/Sidebar.tsx')
  assertIncludes(sidebar, "to: '/powiadomienia'", 'N — nav item')
  assertIncludes(
    sidebar,
    "to === '/powiadomienia' && unreadCount > 0",
    'O — badge on inbox',
  )
  assertIncludes(sidebar, "unreadCount > 99 ? '99+'", 'O — 99+ cap')

  const css = read('src/pages/NotificationsPage.module.css')
  assertIncludes(css, 'overflow-wrap: anywhere', 'K — long text wrap')
  assertIncludes(css, 'min-height: 44px', 'K — touch targets')

  console.log('PASS  notification center UI')
}

console.log('\nAll Notification Center V1 acceptance checks passed.')

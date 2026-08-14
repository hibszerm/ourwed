/**
 * Canonical React Query keys + hooks for in-app notifications inbox.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  NOTIFICATION_DASHBOARD_LATEST,
  NOTIFICATION_PAGE_SIZE,
  notificationService,
  type NotificationListFilter,
  type NotificationListPage,
} from '@/lib/api/notificationService'
import type { Notification } from '@/types/wedding'

export const NOTIFICATIONS_KEY = 'notifications' as const
export const NOTIFICATIONS_UNREAD_COUNT_KEY = 'notifications-unread-count' as const
export const NOTIFICATIONS_LATEST_KEY = 'notifications-latest' as const

export function notificationsListQueryKey(
  userId: string | null | undefined,
  filter: NotificationListFilter,
) {
  return [NOTIFICATIONS_KEY, userId, filter] as const
}

export function notificationsUnreadCountQueryKey(
  userId: string | null | undefined,
) {
  return [NOTIFICATIONS_UNREAD_COUNT_KEY, userId] as const
}

export function notificationsLatestQueryKey(
  userId: string | null | undefined,
  limit: number = NOTIFICATION_DASHBOARD_LATEST,
) {
  return [NOTIFICATIONS_LATEST_KEY, userId, limit] as const
}

const freshness = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: true,
}

export function useUnreadNotificationCount() {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: notificationsUnreadCountQueryKey(userId),
    queryFn: () => notificationService.unreadCount(),
    enabled: Boolean(userId),
    ...freshness,
  })
}

export function useLatestNotifications(
  limit: number = NOTIFICATION_DASHBOARD_LATEST,
) {
  const userId = useStudioAuthId()
  return useQuery({
    queryKey: notificationsLatestQueryKey(userId, limit),
    queryFn: () => notificationService.listLatest(limit),
    enabled: Boolean(userId),
    ...freshness,
  })
}

export function useNotificationsInfinite(filter: NotificationListFilter) {
  const userId = useStudioAuthId()
  return useInfiniteQuery({
    queryKey: notificationsListQueryKey(userId, filter),
    queryFn: ({ pageParam }) =>
      notificationService.listPage({
        limit: NOTIFICATION_PAGE_SIZE,
        cursor: pageParam,
        unreadOnly: filter === 'unread',
      }),
    initialPageParam: null as NotificationListPage['nextCursor'],
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(userId),
    ...freshness,
  })
}

function markItemReadInPages(
  data: InfiniteData<NotificationListPage> | undefined,
  id: string,
): InfiniteData<NotificationListPage> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),
  }
}

function markAllReadInPages(
  data: InfiniteData<NotificationListPage> | undefined,
): InfiniteData<NotificationListPage> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((n) => ({ ...n, read: true })),
    })),
  }
}

function markLatestRead(
  items: Notification[] | undefined,
  id: string,
): Notification[] | undefined {
  if (!items) return items
  return items.map((n) => (n.id === id ? { ...n, read: true } : n))
}

export function invalidateNotificationQueries(queryClient: QueryClient): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] }),
    queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_UNREAD_COUNT_KEY] }),
    queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_LATEST_KEY] }),
  ]).catch(() => undefined)
}

export function useMarkNotificationRead() {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [NOTIFICATIONS_KEY] })
      await queryClient.cancelQueries({
        queryKey: [NOTIFICATIONS_UNREAD_COUNT_KEY],
      })
      await queryClient.cancelQueries({ queryKey: [NOTIFICATIONS_LATEST_KEY] })

      const prevCount = queryClient.getQueryData<number>(
        notificationsUnreadCountQueryKey(userId),
      )
      const prevAll = queryClient.getQueryData<
        InfiniteData<NotificationListPage>
      >(notificationsListQueryKey(userId, 'all'))
      const prevUnread = queryClient.getQueryData<
        InfiniteData<NotificationListPage>
      >(notificationsListQueryKey(userId, 'unread'))
      const prevLatest = queryClient.getQueryData<Notification[]>(
        notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
      )

      const wasUnread =
        prevLatest?.find((n) => n.id === id)?.read === false ||
        prevAll?.pages.some((p) =>
          p.items.some((n) => n.id === id && !n.read),
        ) ||
        prevUnread?.pages.some((p) =>
          p.items.some((n) => n.id === id && !n.read),
        )

      if (wasUnread && typeof prevCount === 'number' && prevCount > 0) {
        queryClient.setQueryData(
          notificationsUnreadCountQueryKey(userId),
          prevCount - 1,
        )
      }

      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'all'),
        markItemReadInPages(prevAll, id),
      )
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'unread'),
        markItemReadInPages(prevUnread, id),
      )
      queryClient.setQueryData(
        notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
        markLatestRead(prevLatest, id),
      )

      return { prevCount, prevAll, prevUnread, prevLatest }
    },
    onError: (_err, _id, ctx) => {
      if (!ctx) return
      queryClient.setQueryData(
        notificationsUnreadCountQueryKey(userId),
        ctx.prevCount,
      )
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'all'),
        ctx.prevAll,
      )
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'unread'),
        ctx.prevUnread,
      )
      queryClient.setQueryData(
        notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
        ctx.prevLatest,
      )
    },
    onSettled: () => {
      invalidateNotificationQueries(queryClient)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [NOTIFICATIONS_KEY] })
      await queryClient.cancelQueries({
        queryKey: [NOTIFICATIONS_UNREAD_COUNT_KEY],
      })
      await queryClient.cancelQueries({ queryKey: [NOTIFICATIONS_LATEST_KEY] })

      const prevCount = queryClient.getQueryData<number>(
        notificationsUnreadCountQueryKey(userId),
      )
      const prevAll = queryClient.getQueryData<
        InfiniteData<NotificationListPage>
      >(notificationsListQueryKey(userId, 'all'))
      const prevUnread = queryClient.getQueryData<
        InfiniteData<NotificationListPage>
      >(notificationsListQueryKey(userId, 'unread'))
      const prevLatest = queryClient.getQueryData<Notification[]>(
        notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
      )

      queryClient.setQueryData(notificationsUnreadCountQueryKey(userId), 0)
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'all'),
        markAllReadInPages(prevAll),
      )
      queryClient.setQueryData(notificationsListQueryKey(userId, 'unread'), {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [null],
      })
      if (prevLatest) {
        queryClient.setQueryData(
          notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
          prevLatest.map((n) => ({ ...n, read: true })),
        )
      }

      return { prevCount, prevAll, prevUnread, prevLatest }
    },
    onError: (_err, _v, ctx) => {
      if (!ctx) return
      queryClient.setQueryData(
        notificationsUnreadCountQueryKey(userId),
        ctx.prevCount,
      )
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'all'),
        ctx.prevAll,
      )
      queryClient.setQueryData(
        notificationsListQueryKey(userId, 'unread'),
        ctx.prevUnread,
      )
      queryClient.setQueryData(
        notificationsLatestQueryKey(userId, NOTIFICATION_DASHBOARD_LATEST),
        ctx.prevLatest,
      )
    },
    onSettled: () => {
      invalidateNotificationQueries(queryClient)
    },
  })
}

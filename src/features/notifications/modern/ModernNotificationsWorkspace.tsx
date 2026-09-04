import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { ModernNotificationRow } from '@/features/notifications/modern/ModernNotificationRow'
import {
  NOTIFICATIONS_EMPTY_ALL_COPY,
  NOTIFICATIONS_EMPTY_ALL_TITLE,
  NOTIFICATIONS_EMPTY_UNREAD_COPY,
  NOTIFICATIONS_EMPTY_UNREAD_TITLE,
  NOTIFICATIONS_ERROR_RETRY,
  NOTIFICATIONS_ERROR_TITLE,
  NOTIFICATIONS_FILTER_ARIA,
  NOTIFICATIONS_LOAD_MORE,
  NOTIFICATIONS_LOAD_MORE_PENDING,
  NOTIFICATIONS_MARK_ALL,
  NOTIFICATIONS_MARK_ALL_ERROR,
  NOTIFICATIONS_MARK_ALL_PENDING,
  NOTIFICATIONS_SKELETON_ROWS,
  NOTIFICATIONS_SUBTITLE,
  NOTIFICATIONS_TAB_ALL,
  NOTIFICATIONS_TAB_UNREAD,
  NOTIFICATIONS_TITLE,
} from '@/features/notifications/modern/notificationsCopy'
import {
  notificationsLatestQueryKey,
  notificationsListQueryKey,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInfinite,
  useUnreadNotificationCount,
} from '@/features/notifications/useNotifications'
import type {
  NotificationListFilter,
  NotificationListPage,
} from '@/lib/api/notificationService'
import type { Notification } from '@/types/wedding'
import styles from './ModernNotificationsWorkspace.module.css'

export function ModernNotificationsWorkspace() {
  const navigate = useNavigate()
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<NotificationListFilter>('all')
  const unreadQuery = useUnreadNotificationCount()
  const listQuery = useNotificationsInfinite(filter)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const unreadCount = unreadQuery.data ?? 0
  const items = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data],
  )

  const allInboxIsEmpty = !inboxHasCachedItems(queryClient, userId)

  async function activate(notification: Notification) {
    const needsRead = !notification.read
    if (needsRead) {
      try {
        await markRead.mutateAsync(notification.id)
      } catch {
        // Navigation may still proceed when a link exists.
      }
    }
    if (notification.link) {
      navigate(notification.link)
    }
  }

  return (
    <div className={styles.page} data-testid="notifications-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.pageTitle}>{NOTIFICATIONS_TITLE}</h1>
          <p className={styles.lead}>{NOTIFICATIONS_SUBTITLE}</p>
        </div>
        {unreadCount > 0 ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.markAll}
              disabled={markAll.isPending}
              onClick={() => void markAll.mutateAsync()}
            >
              {markAll.isPending
                ? NOTIFICATIONS_MARK_ALL_PENDING
                : NOTIFICATIONS_MARK_ALL}
            </button>
          </div>
        ) : null}
      </header>

      <div className={styles.catalog}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={NOTIFICATIONS_FILTER_ARIA}
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`${styles.tab} ${filter === 'all' ? styles.tabActive : ''}`}
            onClick={() => setFilter('all')}
          >
            {NOTIFICATIONS_TAB_ALL}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`${styles.tab} ${filter === 'unread' ? styles.tabActive : ''}`}
            onClick={() => setFilter('unread')}
          >
            {NOTIFICATIONS_TAB_UNREAD}
            {unreadCount > 0 ? (
              <span className={styles.tabCount}>{unreadCount}</span>
            ) : null}
          </button>
        </div>

        {markAll.isError ? (
          <p className={styles.inlineError} role="alert">
            {NOTIFICATIONS_MARK_ALL_ERROR}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <div
            className={styles.surface}
            aria-hidden
            data-testid="notifications-loading"
          >
            <div className={styles.skeleton}>
              {Array.from({ length: NOTIFICATIONS_SKELETON_ROWS }, (_, index) => (
                <div key={index} className={styles.skeletonRow}>
                  <span className={styles.skeletonDot} />
                  <div className={styles.skeletonCopy}>
                    <span className={styles.skeletonTitle} />
                    <span className={styles.skeletonMessage} />
                  </div>
                  <span className={styles.skeletonTime} />
                </div>
              ))}
            </div>
          </div>
        ) : listQuery.isError ? (
          <div className={styles.surface} data-testid="notifications-error">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{NOTIFICATIONS_ERROR_TITLE}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void listQuery.refetch()}
              >
                {NOTIFICATIONS_ERROR_RETRY}
              </Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          filter === 'unread' && !allInboxIsEmpty ? (
            <div className={styles.surface} data-testid="notifications-empty-unread">
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>
                  {NOTIFICATIONS_EMPTY_UNREAD_TITLE}
                </p>
                <p className={styles.emptyDesc}>
                  {NOTIFICATIONS_EMPTY_UNREAD_COPY}
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.surface} data-testid="notifications-empty-all">
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{NOTIFICATIONS_EMPTY_ALL_TITLE}</p>
                <p className={styles.emptyDesc}>{NOTIFICATIONS_EMPTY_ALL_COPY}</p>
              </div>
            </div>
          )
        ) : (
          <>
            <div className={styles.surface}>
              <ul className={styles.list}>
                {items.map((notification) => (
                  <ModernNotificationRow
                    key={notification.id}
                    notification={notification}
                    onActivate={(item) => void activate(item)}
                  />
                ))}
              </ul>
            </div>

            {listQuery.hasNextPage ? (
              <div className={styles.moreWrap}>
                <button
                  type="button"
                  className={styles.loadMore}
                  disabled={listQuery.isFetchingNextPage}
                  onClick={() => void listQuery.fetchNextPage()}
                >
                  {listQuery.isFetchingNextPage
                    ? NOTIFICATIONS_LOAD_MORE_PENDING
                    : NOTIFICATIONS_LOAD_MORE}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function inboxHasCachedItems(
  queryClient: QueryClient,
  userId: string | null | undefined,
): boolean {
  const all = queryClient.getQueryData<InfiniteData<NotificationListPage>>(
    notificationsListQueryKey(userId, 'all'),
  )
  if (all?.pages.some((page) => page.items.length > 0)) return true

  const latest = queryClient.getQueryData<Notification[]>(
    notificationsLatestQueryKey(userId),
  )
  return Boolean(latest && latest.length > 0)
}

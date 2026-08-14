import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { IconBell } from '@/components/icons'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInfinite,
  useUnreadNotificationCount,
} from '@/features/notifications/useNotifications'
import type { NotificationListFilter } from '@/lib/api/notificationService'
import { formatShortDate } from '@/lib/utils/dates'
import type { Notification } from '@/types/wedding'
import styles from './NotificationsPage.module.css'

function formatNotificationWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatShortDate(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (sameDay) return `Dzisiaj, ${time}`
  return `${formatShortDate(iso)}, ${time}`
}

export function NotificationsPage() {
  const navigate = useNavigate()
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

  const headerAction =
    unreadCount > 0 ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={markAll.isPending}
        onClick={() => void markAll.mutateAsync()}
      >
        {markAll.isPending
          ? 'Oznaczanie…'
          : 'Oznacz wszystkie jako przeczytane'}
      </Button>
    ) : null

  return (
    <AppLayout
      title="Powiadomienia"
      subtitle="Wszystkie ważne informacje związane z Twoimi zleceniami."
      action={headerAction}
    >
      <PageContainer width="default">
        <div className={styles.toolbar} role="tablist" aria-label="Filtr powiadomień">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`${styles.tab} ${filter === 'all' ? styles.tabActive : ''}`}
            onClick={() => setFilter('all')}
          >
            Wszystkie
            {listQuery.isSuccess && filter === 'all' ? (
              <span className={styles.tabCount}>{items.length}{listQuery.hasNextPage ? '+' : ''}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`${styles.tab} ${filter === 'unread' ? styles.tabActive : ''}`}
            onClick={() => setFilter('unread')}
          >
            Nieprzeczytane
            {unreadCount > 0 ? (
              <span className={styles.tabCount}>{unreadCount}</span>
            ) : null}
          </button>
        </div>

        {markAll.isError ? (
          <p className={styles.inlineError} role="alert">
            Nie udało się oznaczyć wszystkich jako przeczytane. Spróbuj ponownie.
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <div className={styles.loading} aria-busy="true">
            Ładowanie powiadomień…
          </div>
        ) : listQuery.isError ? (
          <EmptyState
            title="Nie udało się załadować powiadomień"
            description="Odśwież stronę lub spróbuj ponownie za chwilę."
          />
        ) : items.length === 0 ? (
          filter === 'unread' ? (
            <EmptyState
              title="Wszystko przeczytane"
              description="Nie masz nowych powiadomień."
            />
          ) : (
            <EmptyState
              title="Nie masz jeszcze żadnych powiadomień"
              description="Nowe alerty pojawią się tutaj."
            />
          )
        ) : (
          <>
            <ul className={styles.list}>
              {items.map((notification) => {
                const actionable =
                  Boolean(notification.link) || !notification.read
                const unreadLabel = notification.read
                  ? undefined
                  : 'nieprzeczytane'
                const label = `${notification.title}${unreadLabel ? `, ${unreadLabel}` : ''}`
                return (
                  <li key={notification.id}>
                    {actionable ? (
                      <button
                        type="button"
                        className={`${styles.row} ${styles.rowButton} ${!notification.read ? styles.unread : ''}`}
                        onClick={() => void activate(notification)}
                        aria-label={label}
                      >
                        <NotificationRowBody notification={notification} />
                      </button>
                    ) : (
                      <div
                        className={`${styles.row} ${!notification.read ? styles.unread : ''}`}
                        aria-label={label}
                      >
                        <NotificationRowBody notification={notification} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {listQuery.hasNextPage ? (
              <div className={styles.moreWrap}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={listQuery.isFetchingNextPage}
                  onClick={() => void listQuery.fetchNextPage()}
                >
                  {listQuery.isFetchingNextPage
                    ? 'Ładowanie…'
                    : 'Pokaż więcej'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </PageContainer>
    </AppLayout>
  )
}

function NotificationRowBody({
  notification,
}: {
  notification: Notification
}) {
  return (
    <>
      <span className={styles.leading}>
        {!notification.read ? (
          <span className={styles.dot} aria-hidden />
        ) : (
          <span className={styles.dotSpacer} aria-hidden />
        )}
        <span className={`${styles.icon} ${styles[notification.type]}`}>
          <IconBell width={14} height={14} />
        </span>
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{notification.title}</p>
        <p className={styles.message}>{notification.message}</p>
        <time className={styles.date} dateTime={notification.createdAtIso}>
          {formatNotificationWhen(notification.createdAtIso)}
        </time>
      </div>
    </>
  )
}

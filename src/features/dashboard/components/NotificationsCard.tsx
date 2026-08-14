import { Link, useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconBell } from '@/components/icons'
import {
  useLatestNotifications,
  useMarkNotificationRead,
  useUnreadNotificationCount,
} from '@/features/notifications/useNotifications'
import { NOTIFICATION_DASHBOARD_LATEST } from '@/lib/api/notificationService'
import { formatShortDate } from '@/lib/utils/dates'
import type { Notification } from '@/types/wedding'
import styles from './NotificationsCard.module.css'

interface NotificationsCardProps {
  /** Optional override for demos / landing. Live Dashboard leaves this unset. */
  notifications?: Notification[]
  unreadCountOverride?: number
}

export function NotificationsCard({
  notifications: notificationsProp,
  unreadCountOverride,
}: NotificationsCardProps = {}) {
  const navigate = useNavigate()
  const latestQuery = useLatestNotifications(NOTIFICATION_DASHBOARD_LATEST)
  const unreadQuery = useUnreadNotificationCount()
  const markRead = useMarkNotificationRead()

  const notifications =
    notificationsProp ?? latestQuery.data ?? []
  const unread =
    unreadCountOverride ??
    unreadQuery.data ??
    notifications.filter((n) => !n.read).length

  const loading =
    notificationsProp == null && latestQuery.isLoading && !latestQuery.data

  async function handleActivate(notification: Notification) {
    if (!notification.read) {
      try {
        await markRead.mutateAsync(notification.id)
      } catch {
        // Navigation may still continue; do not block.
      }
    }
    if (notification.link) {
      navigate(notification.link)
    }
  }

  return (
    <Card className={styles.panel}>
      <CardHeader
        title="Powiadomienia"
        subtitle={
          unread > 0 ? `${unread} nieprzeczytane` : 'Wszystko przeczytane'
        }
      />
      {loading ? (
        <div className={styles.loadingPulse} aria-busy="true" />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Brak powiadomień"
          description="Nowe alerty pojawią się tutaj."
        />
      ) : (
        <ul className={styles.list}>
          {notifications.slice(0, NOTIFICATION_DASHBOARD_LATEST).map(
            (notification) => {
              const actionable =
                Boolean(notification.link) || !notification.read
              const unreadLabel = notification.read
                ? undefined
                : 'nieprzeczytane'
              return (
                <li key={notification.id}>
                  {actionable ? (
                    <button
                      type="button"
                      className={`${styles.item} ${styles.itemButton} ${!notification.read ? styles.unread : ''}`}
                      onClick={() => void handleActivate(notification)}
                      aria-label={`${notification.title}${unreadLabel ? `, ${unreadLabel}` : ''}`}
                    >
                      <NotificationBody notification={notification} />
                    </button>
                  ) : (
                    <div
                      className={`${styles.item} ${!notification.read ? styles.unread : ''}`}
                      aria-label={`${notification.title}${unreadLabel ? `, ${unreadLabel}` : ''}`}
                    >
                      <NotificationBody notification={notification} />
                    </div>
                  )}
                </li>
              )
            },
          )}
        </ul>
      )}
      <div className={styles.footer}>
        <Link to="/powiadomienia" className={styles.seeAll}>
          Zobacz wszystkie
        </Link>
      </div>
    </Card>
  )
}

function NotificationBody({ notification }: { notification: Notification }) {
  return (
    <>
      <span className={`${styles.icon} ${styles[notification.type]}`}>
        <IconBell width={14} height={14} />
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{notification.title}</p>
        <p className={styles.message}>{notification.message}</p>
        <time className={styles.date}>
          {formatShortDate(notification.createdAtIso ?? notification.createdAt)}
        </time>
      </div>
    </>
  )
}

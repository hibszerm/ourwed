import { Link, useNavigate } from 'react-router-dom'
import { IconBell } from '@/components/icons'
import {
  useLatestNotifications,
  useMarkNotificationRead,
  useUnreadNotificationCount,
} from '@/features/notifications/useNotifications'
import { NOTIFICATION_DASHBOARD_LATEST } from '@/lib/api/notificationService'
import { formatShortDate } from '@/lib/utils/dates'
import type { Notification } from '@/types/wedding'
import styles from './DashboardV3NotificationsPanel.module.css'

export function DashboardV3NotificationsPanel() {
  const navigate = useNavigate()
  const latestQuery = useLatestNotifications(NOTIFICATION_DASHBOARD_LATEST)
  const unreadQuery = useUnreadNotificationCount()
  const markRead = useMarkNotificationRead()

  const notifications = latestQuery.data ?? []
  const unread =
    unreadQuery.data ?? notifications.filter((n) => !n.read).length
  const loading = latestQuery.isLoading && !latestQuery.data

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
    <section
      className={`${styles.panel} v3MaterialSupporting`}
      aria-labelledby="dashboard-v3-notifications-title"
      data-testid="dashboard-v3-notifications"
    >
      <header className={styles.header}>
        <h2 id="dashboard-v3-notifications-title" className={styles.title}>
          Powiadomienia
        </h2>
        <p className={styles.subtitle}>
          {unread > 0 ? `${unread} nieprzeczytane` : 'Wszystko przeczytane'}
        </p>
      </header>

      {loading ? (
        <div className={styles.loadingPulse} aria-busy="true" />
      ) : notifications.length === 0 ? (
        <p className={styles.empty}>Brak powiadomień</p>
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
    </section>
  )
}

function NotificationBody({ notification }: { notification: Notification }) {
  return (
    <>
      <span className={`${styles.icon} ${styles[notification.type]}`}>
        <IconBell width={13} height={13} />
      </span>
      <div className={styles.content}>
        <div className={styles.rowTop}>
          <p className={styles.itemTitle}>{notification.title}</p>
          <time className={styles.date}>
            {formatShortDate(notification.createdAtIso ?? notification.createdAt)}
          </time>
        </div>
        <p className={styles.message}>{notification.message}</p>
      </div>
    </>
  )
}

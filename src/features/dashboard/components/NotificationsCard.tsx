import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconBell } from '@/components/icons'
import { notificationService } from '@/lib/api/notificationService'
import { formatShortDate } from '@/lib/utils/dates'
import type { Notification } from '@/types/wedding'
import styles from './NotificationsCard.module.css'

interface NotificationsCardProps {
  notifications: Notification[]
  onMarkedRead?: (id: string) => void
}

export function NotificationsCard({
  notifications,
  onMarkedRead,
}: NotificationsCardProps) {
  const navigate = useNavigate()
  const unread = notifications.filter((n) => !n.read).length

  async function handleActivate(notification: Notification) {
    if (!notification.read) {
      try {
        await notificationService.markRead(notification.id)
        onMarkedRead?.(notification.id)
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
        subtitle={unread > 0 ? `${unread} nieprzeczytane` : 'Wszystko przeczytane'}
      />
      {notifications.length === 0 ? (
        <EmptyState
          title="Brak powiadomień"
          description="Nowe alerty pojawią się tutaj."
        />
      ) : (
        <ul className={styles.list}>
          {notifications.slice(0, 4).map((notification) => {
            const interactive = Boolean(notification.link)
            const unreadLabel = notification.read ? undefined : 'nieprzeczytane'
            return (
              <li key={notification.id}>
                {interactive ? (
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
          })}
        </ul>
      )}
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
          {formatShortDate(notification.createdAt)}
        </time>
      </div>
    </>
  )
}

import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconBell } from '@/components/icons'
import { formatShortDate } from '@/lib/utils/dates'
import type { Notification } from '@/types/wedding'
import styles from './NotificationsCard.module.css'

interface NotificationsCardProps {
  notifications: Notification[]
}

export function NotificationsCard({ notifications }: NotificationsCardProps) {
  const unread = notifications.filter((n) => !n.read).length

  return (
    <Card>
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
          {notifications.slice(0, 4).map((notification) => (
            <li
              key={notification.id}
              className={`${styles.item} ${!notification.read ? styles.unread : ''}`}
            >
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

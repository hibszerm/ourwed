import type { Notification } from '@/types/wedding'
import { formatNotificationWhen } from '@/features/notifications/modern/formatNotificationWhen'
import { NOTIFICATIONS_UNREAD_ARIA } from '@/features/notifications/modern/notificationsCopy'
import styles from './ModernNotificationsWorkspace.module.css'

export function ModernNotificationRow({
  notification,
  onActivate,
}: {
  notification: Notification
  onActivate: (notification: Notification) => void
}) {
  const actionable = Boolean(notification.link) || !notification.read
  const unreadLabel = notification.read ? undefined : NOTIFICATIONS_UNREAD_ARIA
  const label = `${notification.title}${unreadLabel ? `, ${unreadLabel}` : ''}`
  const rowClass = `${styles.row} ${!notification.read ? styles.unread : ''}`

  const body = <NotificationRowBody notification={notification} />

  if (actionable) {
    return (
      <li>
        <button
          type="button"
          className={`${rowClass} ${styles.rowButton}`}
          onClick={() => onActivate(notification)}
          aria-label={label}
        >
          {body}
        </button>
      </li>
    )
  }

  return (
    <li>
      <div className={rowClass} aria-label={label}>
        {body}
      </div>
    </li>
  )
}

function NotificationRowBody({ notification }: { notification: Notification }) {
  return (
    <>
      <span className={styles.leading} aria-hidden="true">
        {!notification.read ? (
          <span className={styles.dot} />
        ) : (
          <span className={styles.dotSpacer} />
        )}
      </span>
      <div className={styles.content}>
        <p className={!notification.read ? styles.titleUnread : styles.title}>
          {notification.title}
        </p>
        <p className={styles.message}>{notification.message}</p>
      </div>
      <time className={styles.date} dateTime={notification.createdAtIso}>
        {formatNotificationWhen(notification.createdAtIso)}
      </time>
    </>
  )
}

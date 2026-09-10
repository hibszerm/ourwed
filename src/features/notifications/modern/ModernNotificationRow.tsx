import { Trash2 } from 'lucide-react'
import type { Notification } from '@/types/wedding'
import { formatNotificationWhen } from '@/features/notifications/modern/formatNotificationWhen'
import {
  NOTIFICATIONS_DELETE_ARIA,
  NOTIFICATIONS_UNREAD_ARIA,
} from '@/features/notifications/modern/notificationsCopy'
import styles from './ModernNotificationsWorkspace.module.css'

export function ModernNotificationRow({
  notification,
  onActivate,
  onDeleteRequest,
}: {
  notification: Notification
  onActivate: (notification: Notification) => void
  onDeleteRequest: (notification: Notification) => void
}) {
  const actionable = Boolean(notification.link) || !notification.read
  const unreadLabel = notification.read ? undefined : NOTIFICATIONS_UNREAD_ARIA
  const label = `${notification.title}${unreadLabel ? `, ${unreadLabel}` : ''}`
  const rowClass = `${styles.row} ${!notification.read ? styles.unread : ''}`

  return (
    <li>
      <div className={rowClass} data-testid="notification-row">
        <span className={styles.leading} aria-hidden="true">
          {!notification.read ? (
            <span className={styles.dot} />
          ) : (
            <span className={styles.dotSpacer} />
          )}
        </span>
        {actionable ? (
          <button
            type="button"
            className={`${styles.contentActivate} ${styles.rowButton}`}
            onClick={() => onActivate(notification)}
            aria-label={label}
          >
            <p className={!notification.read ? styles.titleUnread : styles.title}>
              {notification.title}
            </p>
            <p className={styles.message}>{notification.message}</p>
          </button>
        ) : (
          <div className={styles.content} aria-label={label}>
            <p className={!notification.read ? styles.titleUnread : styles.title}>
              {notification.title}
            </p>
            <p className={styles.message}>{notification.message}</p>
          </div>
        )}
        <div className={styles.trailing}>
          <time className={styles.date} dateTime={notification.createdAtIso}>
            {formatNotificationWhen(notification.createdAtIso)}
          </time>
          <button
            type="button"
            className={styles.deleteBtn}
            aria-label={NOTIFICATIONS_DELETE_ARIA}
            data-testid="notification-delete"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteRequest(notification)
            }}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}

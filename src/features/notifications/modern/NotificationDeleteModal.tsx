import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  NOTIFICATIONS_DELETE_CONFIRM,
  NOTIFICATIONS_DELETE_ERROR,
  NOTIFICATIONS_DELETE_PENDING,
  NOTIFICATIONS_DELETE_SUCCESS,
  NOTIFICATIONS_DELETE_TITLE,
} from '@/features/notifications/modern/notificationsCopy'
import { useDeleteNotification } from '@/features/notifications/useNotifications'
import type { Notification } from '@/types/wedding'

export interface NotificationDeleteModalProps {
  open: boolean
  notification: Notification | null
  onClose: () => void
}

export function NotificationDeleteModal({
  open,
  notification,
  onClose,
}: NotificationDeleteModalProps) {
  const { showToast } = useToast()
  const deleteNotification = useDeleteNotification()
  const [error, setError] = useState<string | null>(null)

  const busy = deleteNotification.isPending

  async function handleDelete() {
    if (!notification || busy) return
    setError(null)
    try {
      await deleteNotification.mutateAsync(notification.id)
      showToast(NOTIFICATIONS_DELETE_SUCCESS)
      onClose()
    } catch {
      setError(NOTIFICATIONS_DELETE_ERROR)
      showToast(NOTIFICATIONS_DELETE_ERROR, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={NOTIFICATIONS_DELETE_TITLE}
      busy={busy}
      mobilePresentation="center"
      primaryAction={
        <Button
          type="button"
          variant="danger"
          disabled={busy || !notification}
          onClick={() => void handleDelete()}
          data-testid="notification-delete-confirm"
        >
          {busy ? NOTIFICATIONS_DELETE_PENDING : NOTIFICATIONS_DELETE_CONFIRM}
        </Button>
      }
    >
      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </p>
      ) : notification ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
          }}
        >
          {notification.title}
        </p>
      ) : null}
    </Modal>
  )
}

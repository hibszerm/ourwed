import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import {
  invalidateTaskDomain,
  removeTaskFromWeddingCaches,
} from '@/features/tasks/invalidateTaskDomain'
import { taskService, type StudioTask } from '@/lib/api/taskService'

export interface TaskDeleteModalProps {
  open: boolean
  onClose: () => void
  task: StudioTask | null
}

export function TaskDeleteModal({ open, onClose, task }: TaskDeleteModalProps) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const { data: studioUser } = useCurrentStudioUser()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!task || busy) return
    setError(null)
    setBusy(true)
    try {
      await taskService.delete(task.id)
      removeTaskFromWeddingCaches(queryClient, studioUser?.id, task)
      void invalidateTaskDomain(queryClient, {
        weddingIds: [task.weddingId],
      })
      showToast('Zadanie zostało usunięte.')
      onClose()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nie udało się usunąć zadania.'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Usunąć zadanie?"
      description="Ta operacja trwale usuwa zadanie."
      busy={busy}
      primaryAction={
        <Button
          type="button"
          variant="danger"
          disabled={busy || !task}
          onClick={() => void handleDelete()}
        >
          {busy ? 'Usuwanie…' : 'Usuń'}
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
      ) : task ? (
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {task.title}
        </p>
      ) : null}
    </Modal>
  )
}

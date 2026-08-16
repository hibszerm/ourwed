import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useIsMobileOverlay } from '@/components/ui/useIsMobileOverlay'
import { useToast } from '@/components/ui/Toast'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import {
  invalidateTaskDomain,
  syncWeddingTaskCaches,
} from '@/features/tasks/invalidateTaskDomain'
import {
  formatTaskWeddingOptionLabel,
  listActiveTaskWeddingOptions,
} from '@/features/tasks/taskWeddingMeta'
import { taskWeddingOptionsQueryKey } from '@/features/tasks/tasksQueryKeys'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import formStyles from '@/features/weddings/actions/actionForm.module.css'

export interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  task?: StudioTask | null
  onRequestDelete?: () => void
}

export function TaskFormModal({
  open,
  onClose,
  task = null,
  onRequestDelete,
}: TaskFormModalProps) {
  const editing = Boolean(task)
  const [busy, setBusy] = useState(false)
  // Match Modal sheet breakpoint (max-width: 767px), not the 640 overlay default.
  const isMobileSheet = useIsMobileOverlay(768)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edytuj zadanie' : 'Dodaj zadanie'}
      description={
        editing
          ? 'Zmień nazwę, termin lub powiązanie ze zleceniem.'
          : 'Dodaj ręczne zadanie — opcjonalnie z terminem i zleceniem.'
      }
      busy={busy}
      // Mobile sheet: calm open — focus dialog panel, no keyboard until tap.
      // Desktop: keep title autofocus via TaskFormFields.
      initialFocus={isMobileSheet ? 'panel' : 'first'}
      secondaryAction={
        editing && onRequestDelete ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onRequestDelete}
          >
            Usuń
          </Button>
        ) : undefined
      }
      primaryAction={
        <Button
          type="submit"
          form="task-form"
          variant="primary"
          disabled={busy}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      {open ? (
        <TaskFormFields
          key={task ? `edit-${task.id}` : 'create'}
          task={task}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
          autofocusTitle={!isMobileSheet}
        />
      ) : null}
    </Modal>
  )
}

function TaskFormFields({
  task,
  busy,
  setBusy,
  onClose,
  autofocusTitle,
}: {
  task: StudioTask | null
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
  autofocusTitle: boolean
}) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const { data: studioUser } = useCurrentStudioUser()
  const userId = studioUser?.id

  const optionsQuery = useQuery({
    queryKey: taskWeddingOptionsQueryKey(userId),
    queryFn: listActiveTaskWeddingOptions,
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const [title, setTitle] = useState(task?.title ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '')
  const [weddingId, setWeddingId] = useState(task?.weddingId ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return

    const trimmed = title.trim()
    if (!trimmed) {
      setError('Podaj nazwę zadania.')
      return
    }

    setError(null)
    setBusy(true)
    try {
      const previousWeddingId = task?.weddingId ?? null
      const nextWeddingId = weddingId.trim() ? weddingId.trim() : null
      const nextDue = dueDate.trim() ? dueDate.trim().slice(0, 10) : null

      let saved
      if (task) {
        saved = await taskService.update(task.id, {
          title: trimmed,
          dueDate: nextDue,
          weddingId: nextWeddingId,
        })
        showToast('Zadanie zostało zapisane.')
      } else {
        saved = await taskService.create({
          title: trimmed,
          dueDate: nextDue ?? undefined,
          weddingId: nextWeddingId,
        })
        showToast('Zadanie zostało dodane.')
      }

      // Immediate wedding Historia cache patch (before background refetch).
      syncWeddingTaskCaches(queryClient, userId, {
        task: saved,
        previousWeddingId,
        nextWeddingId,
      })

      void invalidateTaskDomain(queryClient, {
        weddingIds: [previousWeddingId, nextWeddingId],
      })
      onClose()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nie udało się zapisać zadania.'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const options = optionsQuery.data ?? []
  const linkedMissing =
    task?.weddingId && !options.some((o) => o.id === task.weddingId)
      ? task.weddingId
      : null

  return (
    <form
      id="task-form"
      className={`${formStyles.form} ${formStyles.compactMobileForm}`}
      onSubmit={(e) => void handleSubmit(e)}
    >
      <Input
        label="Nazwa zadania"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Np. Zadzwoń do pary"
        autoFocus={autofocusTitle}
        required
        disabled={busy}
      />

      <Input
        label="Termin"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={busy}
      />

      <Select
        label="Zlecenie"
        value={weddingId}
        onChange={(e) => setWeddingId(e.target.value)}
        disabled={busy || optionsQuery.isLoading}
      >
        <option value="">Brak powiązania</option>
        {linkedMissing ? (
          <option value={linkedMissing}>Bieżące zlecenie</option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {formatTaskWeddingOptionLabel(opt)}
          </option>
        ))}
      </Select>

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
      ) : null}
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useIsMobileOverlay } from '@/components/ui/useIsMobileOverlay'
import { useToast } from '@/components/ui/Toast'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import {
  invalidateTaskDomain,
  collaborativeTaskErrorCode,
  reconcileSharedTaskCaches,
  syncWeddingTaskCaches,
} from '@/features/tasks/invalidateTaskDomain'
import {
  formatTaskWeddingOptionLabel,
  listActiveTaskWeddingOptions,
} from '@/features/tasks/taskWeddingMeta'
import { taskWeddingOptionsQueryKey } from '@/features/tasks/tasksQueryKeys'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import formStyles from '@/features/weddings/actions/actionForm.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { collaborativeTasksService, type CollaborativeTaskTarget } from '@/features/collaboration/collaborativeTasksService'

export interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  task?: StudioTask | null
  onRequestDelete?: () => void
  sharedTargets?: CollaborativeTaskTarget[]
  allowOwnedTargets?: boolean
}

export function TaskFormModal({
  open,
  onClose,
  task = null,
  onRequestDelete,
  sharedTargets = [],
  allowOwnedTargets = true,
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
          sharedTargets={sharedTargets}
          allowOwnedTargets={allowOwnedTargets}
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
  sharedTargets,
  allowOwnedTargets,
  busy,
  setBusy,
  onClose,
  autofocusTitle,
}: {
  task: StudioTask | null
  sharedTargets: CollaborativeTaskTarget[]
  allowOwnedTargets: boolean
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
  const knownSharedTargets = useRef(new Set(sharedTargets.map((target) => target.weddingId)))

  useEffect(() => {
    for (const target of sharedTargets) knownSharedTargets.current.add(target.weddingId)
    if (task?.shared && !sharedTargets.some((target) => target.weddingId === task.weddingId)) onClose()
    if (!task && weddingId && knownSharedTargets.current.has(weddingId)
      && !sharedTargets.some((target) => target.weddingId === weddingId)) onClose()
  }, [onClose, sharedTargets, task, weddingId])

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
      const sharedTarget = !task ? sharedTargets.find((target) => target.weddingId === nextWeddingId) : undefined
      if (!task && nextWeddingId && knownSharedTargets.current.has(nextWeddingId) && !sharedTarget) {
        throw new Error('UNAVAILABLE')
      }
      if (task) {
        if (task.shared) {
          if (!task.weddingId || !task.accessVersion || !task.revision) throw new Error('TASK_AUTHORITY_REQUIRED')
          saved = await collaborativeTasksService.mutate({ action: 'update', weddingId: task.weddingId,
            accessVersion: task.accessVersion, taskId: task.id, expectedRevision: task.revision,
            title: trimmed, dueDate: nextDue })
        } else saved = await taskService.update(task.id, { title: trimmed, dueDate: nextDue, weddingId: nextWeddingId })
        showToast('Zadanie zostało zapisane.')
      } else if (sharedTarget) {
        saved = await collaborativeTasksService.mutate({ action: 'create', weddingId: sharedTarget.weddingId,
          accessVersion: sharedTarget.accessVersion, title: trimmed, dueDate: nextDue })
        showToast('Zadanie zostało dodane.')
      } else {
        saved = await taskService.create({
          title: trimmed,
          dueDate: nextDue ?? undefined,
          weddingId: nextWeddingId,
        })
        showToast('Zadanie zostało dodane.')
      }

      // Immediate wedding Historia cache patch (before background refetch).
      if (saved && 'weddingId' in saved && !task?.shared && !sharedTarget) {
        const cacheTask = 'status' in saved
          ? { id: saved.id, title: saved.title, weddingId: saved.weddingId,
              dueDate: saved.dueDate, completed: saved.status === 'done', priority: 'medium' as const }
          : saved
        syncWeddingTaskCaches(queryClient, userId, { task: cacheTask, previousWeddingId, nextWeddingId })
      }

      void invalidateTaskDomain(queryClient, {
        weddingIds: [previousWeddingId, nextWeddingId],
      })
      onClose()
    } catch (err) {
      const authorityError = collaborativeTaskErrorCode(err)
      const sharedWeddingId = task?.shared ? task.weddingId
        : (knownSharedTargets.current.has(weddingId)
          ? weddingId
          : sharedTargets.find((target) => target.weddingId === weddingId)?.weddingId)
      if (authorityError && sharedWeddingId) {
        await reconcileSharedTaskCaches(queryClient, userId, { weddingId: sharedWeddingId, outcome: authorityError })
        onClose()
      }
      const message =
        getUserFacingErrorMessage(err, 'Nie udało się zapisać zadania.')
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const options = [...(allowOwnedTargets ? optionsQuery.data ?? [] : []), ...sharedTargets.map((target) => ({
    id: target.weddingId, label: target.weddingLabel, weddingDate: null,
  }))]
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

      {!task?.shared ? <Select
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
      </Select> : null}

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

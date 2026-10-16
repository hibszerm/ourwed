import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { ProGateAction, useProAccessGate } from '@/features/billing/ProAccessGate'
import { collaborativeTasksService, type CollaborativeTask } from '@/features/collaboration/collaborativeTasksService'
import { collaborativeTaskErrorCode, invalidateTaskDomain, reconcileSharedTaskCaches } from '@/features/tasks/invalidateTaskDomain'
import { weddingTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { taskService } from '@/lib/api/taskService'
import type { Task, Wedding } from '@/types/wedding'
import { CanonicalTaskRow } from './CanonicalTaskRow'
import styles from './CanonicalWeddingTasksCard.module.css'
import dashboardRowStyles from '@/features/dashboard-v3/DashboardV3TodayPanel.module.css'

type SelectedTask = Task & { revision?: string }
function taskFromShared(task: CollaborativeTask): SelectedTask {
  return { id: task.id, title: task.title, weddingId: task.weddingId, dueDate: task.dueDate,
    completed: task.status === 'done', priority: 'medium', revision: task.revision }
}

export function CanonicalWeddingTasksCard({ weddingId, wedding, accessVersion, tasksLevel }: {
  weddingId: string; wedding: Wedding; accessVersion?: string; tasksLevel: 0 | 1 | 2
}) {
  const { user } = useAuth()
  const { canUsePro } = useProAccessGate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const shared = Boolean(accessVersion)
  const editable = !shared || tasksLevel === 2
  const canAdd = shared ? editable : canUsePro === true
  const queryKey = shared
    ? ['collaborative-tasks-v3', user?.id, weddingId, accessVersion]
    : weddingTasksQueryKey(user?.id, weddingId)
  const query = useQuery({
    queryKey,
    queryFn: async () => shared
      ? collaborativeTasksService.getWedding(weddingId)
      : taskService.listByWeddingId(weddingId),
    enabled: Boolean(user?.id && (shared ? tasksLevel > 0 : true)),
    staleTime: 0,
    refetchInterval: shared ? 30_000 : false,
    refetchIntervalInBackground: false,
  })
  const tasks: SelectedTask[] = shared
    ? ((query.data && !Array.isArray(query.data) ? query.data.tasks : []) as CollaborativeTask[]).map(taskFromShared)
    : ((query.data ?? []) as Task[])
  const [edit, setEdit] = useState<SelectedTask | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [remove, setRemove] = useState<SelectedTask | null>(null)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (shared && tasksLevel === 0) queryClient.removeQueries({ queryKey: ['collaborative-tasks-v3', user?.id, weddingId] })
    return () => { if (shared) queryClient.removeQueries({ queryKey: ['collaborative-tasks-v3', user?.id, weddingId] }) }
  }, [queryClient, shared, tasksLevel, user?.id, weddingId])

  useEffect(() => {
    if (shared && tasksLevel !== 2) {
      setFormOpen(false); setEdit(null); setRemove(null)
    }
  }, [shared, tasksLevel, accessVersion])

  async function reconcileFailure(cause: unknown) {
    const outcome = collaborativeTaskErrorCode(cause)
    if (shared && outcome && user?.id) {
      await reconcileSharedTaskCaches(queryClient, user.id, { weddingId, outcome })
    }
  }

  if (shared && tasksLevel === 0) return null
  const openEdit = (task?: SelectedTask) => {
    setEdit(task ?? null); setTitle(task?.title ?? ''); setDueDate(task?.dueDate ?? ''); setError(null); setFormOpen(true)
  }
  async function persist() {
    if (busy) return
    if (!title.trim()) { setError('Podaj nazwę zadania.'); return }
    setBusy(true); setError(null)
    try {
      if (shared) {
        await collaborativeTasksService.mutate({ action: edit ? 'update' : 'create', weddingId,
          accessVersion: accessVersion!, taskId: edit?.id, expectedRevision: edit?.revision,
          title: title.trim(), dueDate: dueDate || null })
      } else if (edit) {
        await taskService.update(edit.id, { title: title.trim(), dueDate: dueDate || null })
      } else {
        await taskService.create({ title: title.trim(), dueDate: dueDate || undefined, weddingId })
      }
      setEdit(null); setFormOpen(false)
      await Promise.all([query.refetch(), invalidateTaskDomain(queryClient, { weddingIds: [weddingId] })])
    } catch (cause) {
      await reconcileFailure(cause)
      if (shared && collaborativeTaskErrorCode(cause)) { setFormOpen(false); setEdit(null); setRemove(null) }
      setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać zadania.')
    }
    finally { setBusy(false) }
  }
  async function toggle(task: Task) {
    try {
      const source = tasks.find((item) => item.id === task.id)
      if (shared) {
        await collaborativeTasksService.mutate({ action: task.completed ? 'reopen' : 'complete', weddingId,
          accessVersion: accessVersion!, taskId: task.id, expectedRevision: source?.revision })
      } else if (task.completed) await taskService.reopen(task.id)
      else await taskService.complete(task.id)
      await Promise.all([query.refetch(), invalidateTaskDomain(queryClient, { weddingIds: [weddingId] })])
    } catch (cause) { await reconcileFailure(cause); showToast('Nie udało się zaktualizować zadania.', 'error') }
  }
  async function confirmDelete() {
    if (!remove) return
    setBusy(true)
    try {
      if (shared) await collaborativeTasksService.mutate({ action: 'delete', weddingId, accessVersion: accessVersion!, taskId: remove.id, expectedRevision: remove.revision })
      else await taskService.delete(remove.id)
      setRemove(null); await Promise.all([query.refetch(), invalidateTaskDomain(queryClient, { weddingIds: [weddingId] })])
    } catch (cause) { await reconcileFailure(cause); showToast('Nie udało się usunąć zadania.', 'error') }
    finally { setBusy(false) }
  }

  return <section className={`${styles.card} v3MaterialOperational`} data-testid="canonical-wedding-tasks">
    <header className={styles.header}><div><h2>Zadania</h2><p>Najważniejsze rzeczy do zrobienia przy tym zleceniu.</p></div>
      {canAdd ? <Button type="button" variant="secondary" onClick={() => openEdit()}>Dodaj</Button>
        : !shared ? <ProGateAction actionKey="create_task" onAllowed={() => openEdit()}>Dodaj</ProGateAction> : null}</header>
    {query.isLoading ? <p role="status">Ładowanie zadań…</p> : query.isError ? <p role="alert">Nie udało się wczytać zadań.</p>
      : tasks.length ? <ul className={styles.list}>{tasks.map((task) => <CanonicalTaskRow key={task.id} task={task} wedding={wedding}
        canComplete={editable} onComplete={toggle} shared={shared} rowStyles={dashboardRowStyles} onEdit={editable ? openEdit : undefined} onDelete={editable ? setRemove : undefined} />)}</ul>
      : <p className={styles.empty}>Brak zadań dla tego zlecenia.</p>}
    <Modal open={formOpen} onClose={() => { setFormOpen(false); setEdit(null) }} title={edit ? 'Edytuj zadanie' : 'Dodaj zadanie'}
      description="Zadanie jest przypisane do tego zlecenia." mobilePresentation="center" busy={busy}
      primaryAction={<Button type="button" disabled={busy} onClick={() => void persist()}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>}>
      <div className={styles.form}><Input label="Nazwa zadania" value={title} onChange={(event) => setTitle(event.target.value)} required disabled={busy} />
        <Input label="Termin" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={busy} />
        {error ? <p role="alert">{error}</p> : null}</div>
    </Modal>
    <Modal open={Boolean(remove)} onClose={() => setRemove(null)} title="Usunąć zadanie?" description="Ta operacja trwale usuwa zadanie." busy={busy}
      primaryAction={<Button type="button" variant="danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? 'Usuwanie…' : 'Usuń'}</Button>}>
      {remove ? <p>{remove.title}</p> : null}
    </Modal>
  </section>
}

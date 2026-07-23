import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { QuestionnaireModuleNav } from '@/features/questionnaires/QuestionnaireModuleNav'
import {
  archiveFormDefinition,
  bulkArchiveFormDefinitions,
  bulkDeleteFormDefinitions,
  deleteFormDefinition,
  duplicateFormDefinition,
  getForms,
  restoreFormDefinition,
  updateFormDefinition,
} from '@/lib/api/forms'
import type { FormDefinition } from '@/types/formEngine'
import styles from '@/features/studio/StudioCatalog.module.css'

type Filter = 'active' | 'archived' | 'all'

export function QuestionnaireTemplatesPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const userId = useStudioAuthId()
  const [filter, setFilter] = useState<Filter>('active')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<FormDefinition | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<FormDefinition | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['form-templates', userId],
    queryFn: () => getForms(),
    enabled: Boolean(userId),
  })

  const visible = useMemo(() => {
    return data.filter((f) => {
      if (filter === 'active') return f.isActive
      if (filter === 'archived') return !f.isActive
      return true
    })
  }, [data, filter])

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['form-templates'] })
    void queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === visible.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(visible.map((f) => f.id)))
  }

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return
      await updateFormDefinition(editing.id, {
        name: editName,
        description: editDescription,
      })
    },
    onSuccess: () => {
      setEditing(null)
      invalidate()
      showToast('Szablon zaktualizowany', 'success')
    },
    onError: (err) => {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zapisać',
        'error',
      )
    },
  })

  async function runAction(
    action: () => Promise<unknown>,
    success: string,
  ) {
    try {
      await action()
      setSelected(new Set())
      invalidate()
      showToast(success, 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Operacja nie powiodła się',
        'error',
      )
    }
  }

  return (
    <AppLayout
      title="Szablony ankiet"
      subtitle="Szablony używane przy generowaniu ankiet dla klientów"
      action={
        selected.size > 0 ? (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void runAction(
                  () => bulkArchiveFormDefinitions([...selected]),
                  'Zarchiwizowano wybrane szablony',
                )
              }
            >
              Archiwizuj ({selected.size})
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Usuń ({selected.size})
            </Button>
          </div>
        ) : undefined
      }
    >
      <PageContainer width="wide">
        <QuestionnaireModuleNav />
        <div className={styles.stack}>
          <div className={styles.actions}>
            {(
              [
                ['active', 'Aktywne'],
                ['archived', 'Archiwum'],
                ['all', 'Wszystkie'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? 'primary' : 'secondary'}
                onClick={() => {
                  setFilter(value)
                  setSelected(new Set())
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {isError ? (
            <EmptyState
              title="Nie udało się załadować szablonów"
              description={
                error instanceof Error ? error.message : 'Spróbuj ponownie.'
              }
              action={
                <Button type="button" onClick={() => void refetch()}>
                  Odśwież
                </Button>
              }
            />
          ) : isLoading ? (
            <p className={styles.muted}>Ładowanie…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              title={
                filter === 'archived'
                  ? 'Brak zarchiwizowanych szablonów'
                  : 'Brak szablonów ankiet'
              }
              description="Szablony powstają przy konfiguracji dokumentów AI lub możesz je duplikować z istniejących."
            />
          ) : (
            <div className={styles.stack}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={
                    visible.length > 0 && selected.size === visible.length
                  }
                  onChange={toggleAll}
                />
                Zaznacz wszystkie
              </label>

              {visible.map((form) => (
                <article key={form.id} className={styles.card}>
                  <header className={styles.cardHeader}>
                    <div className={styles.cardTitleRow}>
                      <input
                        type="checkbox"
                        checked={selected.has(form.id)}
                        onChange={() => toggleSelect(form.id)}
                        aria-label={`Zaznacz ${form.name}`}
                      />
                      <div>
                        <h2 className={styles.cardTitle}>{form.name}</h2>
                        <p className={styles.muted}>
                          {form.category} · v{form.version}
                          {form.description ? ` · ${form.description}` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge variant={form.isActive ? 'info' : 'neutral'}>
                      {form.isActive ? 'Aktywny' : 'Archiwum'}
                    </Badge>
                  </header>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(form)
                        setEditName(form.name)
                        setEditDescription(form.description ?? '')
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void runAction(
                          () => duplicateFormDefinition(form.id),
                          'Utworzono kopię szablonu',
                        )
                      }
                    >
                      Duplikuj
                    </Button>
                    {form.isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void runAction(
                            () => archiveFormDefinition(form.id),
                            'Zarchiwizowano szablon',
                          )
                        }
                      >
                        Archiwizuj
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void runAction(
                            () => restoreFormDefinition(form.id),
                            'Przywrócono szablon',
                          )
                        }
                      >
                        Przywróć
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => setDeleteTarget(form)}
                    >
                      Usuń
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      <Modal
        open={Boolean(editing)}
        title="Edytuj szablon"
        onClose={() => setEditing(null)}
        busy={editMutation.isPending}
        primaryAction={
          <Button
            type="button"
            variant="primary"
            disabled={!editName.trim() || editMutation.isPending}
            onClick={() => editMutation.mutate()}
          >
            Zapisz
          </Button>
        }
      >
        <Input
          label="Nazwa"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <div style={{ height: 12 }} />
        <Input
          label="Opis"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Usunąć szablon?"
        description="Usunięcie jest możliwe tylko gdy szablon nie ma powiązanych ankiet. Odpowiedzi klientów nigdy nie są usuwane."
        onClose={() => setDeleteTarget(null)}
        primaryAction={
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (!deleteTarget) return
              void runAction(
                () => deleteFormDefinition(deleteTarget.id),
                'Usunięto szablon',
              ).then(() => setDeleteTarget(null))
            }}
          >
            Usuń trwale
          </Button>
        }
      >
        <p className={styles.muted}>
          Szablon: <strong>{deleteTarget?.name}</strong>
        </p>
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        title={`Usunąć ${selected.size} szablonów?`}
        description="Szablony z powiązanymi ankietami zostaną pominięte błędem. Odpowiedzi klientów nie są usuwane."
        onClose={() => setBulkDeleteOpen(false)}
        primaryAction={
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              void runAction(
                () => bulkDeleteFormDefinitions([...selected]),
                'Usunięto wybrane szablony',
              ).then(() => setBulkDeleteOpen(false))
            }}
          >
            Usuń zaznaczone
          </Button>
        }
      >
        <p className={styles.muted}>
          Zaznaczono: {selected.size}
        </p>
      </Modal>
    </AppLayout>
  )
}

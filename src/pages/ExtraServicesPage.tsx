import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { formatCurrency } from '@/lib/utils/currency'
import type { ExtraService } from '@/types/package'
import styles from '@/features/studio/StudioCatalog.module.css'

export function ExtraServicesPage() {
  const queryClient = useQueryClient()
  const { data: services = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['studio-extra-services'],
    queryFn: () => extraServiceService.list(),
  })

  const [editing, setEditing] = useState<ExtraService | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['studio-extra-services'] })

  const ordered = useMemo(
    () => [...services].sort((a, b) => a.sortOrder - b.sortOrder),
    [services],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: {
      name: string
      description: string | null
      price: number
      isActive: boolean
    }) => {
      if (editing) {
        return extraServiceService.update(editing.id, values)
      }
      return extraServiceService.create(values)
    },
    onSuccess: () => {
      setCreating(false)
      setEditing(null)
      void invalidate()
    },
  })

  async function handleReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const ids = ordered.map((s) => s.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await extraServiceService.reorder(next)
    void invalidate()
  }

  return (
    <AppLayout
      title="Usługi dodatkowe"
      subtitle="Katalog Studio — dodatki do pakietów"
      action={
        <Button type="button" variant="primary" onClick={() => setCreating(true)}>
          Nowa usługa
        </Button>
      }
    >
      <PageContainer width="wide">
        {isLoading ? (
          <p className={styles.muted}>Ładowanie…</p>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować usług"
            description={error instanceof Error ? error.message : 'Spróbuj ponownie.'}
          />
        ) : ordered.length === 0 && !creating ? (
          <EmptyState
            title="Brak usług dodatkowych"
            description="Dodaj usługi, które pary mogą dokupić do pakietu."
          />
        ) : (
          <div className={styles.stack}>
            {(creating || editing) && (
              <ExtraServiceForm
                initial={editing}
                busy={saveMutation.isPending}
                onCancel={() => {
                  setCreating(false)
                  setEditing(null)
                }}
                onSave={(values) => saveMutation.mutateAsync(values)}
              />
            )}
            {ordered.map((service) => (
              <article
                key={service.id}
                className={styles.card}
                draggable
                onDragStart={() => setDragId(service.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) void handleReorder(dragId, service.id)
                  setDragId(null)
                }}
              >
                <header className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>{service.name}</h2>
                    <p className={styles.muted}>
                      {formatCurrency(service.price)} · {service.currency}
                      {!service.isActive ? ' · nieaktywna' : ''}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false)
                        setEditing(service)
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (!window.confirm('Usunąć usługę?')) return
                        await extraServiceService.delete(service.id)
                        void invalidate()
                      }}
                    >
                      Usuń
                    </Button>
                  </div>
                </header>
                {service.description ? (
                  <p className={styles.body}>{service.description}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {isError ? (
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}

function ExtraServiceForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: ExtraService | null
  busy: boolean
  onCancel: () => void
  onSave: (values: {
    name: string
    description: string | null
    price: number
    isActive: boolean
  }) => Promise<unknown>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(String(initial?.price ?? ''))
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className={styles.formCard}
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        const priceN = Number(price)
        if (!name.trim()) {
          setError('Podaj nazwę.')
          return
        }
        if (!Number.isFinite(priceN) || priceN < 0) {
          setError('Podaj poprawną cenę.')
          return
        }
        void onSave({
          name: name.trim(),
          description: description.trim() || null,
          price: priceN,
          isActive,
        }).catch((err) =>
          setError(err instanceof Error ? err.message : 'Nie udało się zapisać.'),
        )
      }}
    >
      <h3 className={styles.formTitle}>
        {initial ? 'Edytuj usługę' : 'Nowa usługa'}
      </h3>
      <label className={styles.field}>
        <span>Nazwa</span>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <label className={styles.field}>
        <span>Opis</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={busy}
        />
      </label>
      <label className={styles.field}>
        <span>Cena</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={busy}
        />
        Aktywna
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Anuluj
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      </div>
    </form>
  )
}

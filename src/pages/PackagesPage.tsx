import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { packageItemService } from '@/lib/api/packageItemService'
import { packageService } from '@/lib/api/packageService'
import { formatCurrency } from '@/lib/utils/currency'
import type { StudioPackage } from '@/types/package'
import styles from '@/features/studio/StudioCatalog.module.css'

export function PackagesPage() {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { data: packages, isLoading, isError, error, refetch, isSuccess } =
    useQuery({
      queryKey: ['studio-packages', userId],
      queryFn: () => packageService.list(),
      enabled: Boolean(userId),
    })

  const [editing, setEditing] = useState<StudioPackage | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio-packages'] })
    // Public /form/:token also rebuilds package options from a React Query cache.
    void queryClient.invalidateQueries({ queryKey: ['public-form'] })
  }

  const createMutation = useMutation({
    mutationFn: packageService.create,
    onSuccess: () => {
      setCreating(false)
      void invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Parameters<typeof packageService.update>[1]
    }) => packageService.update(id, patch),
    onSuccess: () => {
      setEditing(null)
      void invalidate()
    },
  })

  const ordered =
    isSuccess && packages
      ? [...packages].sort((a, b) => a.sortOrder - b.sortOrder)
      : undefined

  async function handleReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const ids = ordered.map((p) => p.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await packageService.reorder(next)
    void invalidate()
  }

  return (
    <AppLayout
      title="Pakiety"
      subtitle="Katalog Studio — źródło cen i zawartości pakietów"
      action={
        <Button type="button" variant="primary" onClick={() => setCreating(true)}>
          Nowy pakiet
        </Button>
      }
    >
      <PageContainer width="wide">
        {isError ? (
          <EmptyState
            title="Nie udało się załadować pakietów"
            description={error instanceof Error ? error.message : 'Spróbuj ponownie.'}
          />
        ) : isLoading || !isSuccess || ordered === undefined ? (
          <p className={styles.muted}>Ładowanie pakietów…</p>
        ) : ordered.length === 0 && !creating ? (
          <EmptyState
            title="Brak pakietów"
            description="Dodaj pierwszy pakiet — ankiety i nowe śluby będą z niego korzystać."
          />
        ) : (
          <div className={styles.stack}>
            {(creating || editing) && (
              <PackageForm
                initial={editing}
                busy={createMutation.isPending || updateMutation.isPending}
                onCancel={() => {
                  setCreating(false)
                  setEditing(null)
                }}
                onSave={async (values) => {
                  if (editing) {
                    await updateMutation.mutateAsync({ id: editing.id, patch: values })
                  } else {
                    await createMutation.mutateAsync(values)
                  }
                }}
              />
            )}

            {ordered.map((pkg) => (
              <article
                key={pkg.id}
                className={styles.card}
                draggable
                onDragStart={() => setDragId(pkg.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) void handleReorder(dragId, pkg.id)
                  setDragId(null)
                }}
              >
                <header className={styles.cardHeader}>
                  <div className={styles.cardTitleRow}>
                    <span
                      className={styles.swatch}
                      style={{ background: pkg.color || '#ccc' }}
                    />
                    <div>
                      <h2 className={styles.cardTitle}>{pkg.name}</h2>
                      <p className={styles.muted}>
                        {formatCurrency(pkg.price)} · zaliczka{' '}
                        {formatCurrency(pkg.depositAmount)} · {pkg.currency}
                        {!pkg.isActive ? ' · zarchiwizowany' : ''}
                      </p>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false)
                        setEditing(pkg)
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await packageService.duplicate(pkg.id)
                        void invalidate()
                      }}
                    >
                      Duplikuj
                    </Button>
                    {pkg.isActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await packageService.archive(pkg.id)
                          void invalidate()
                        }}
                      >
                        Archiwizuj
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (!window.confirm('Usunąć pakiet na stałe?')) return
                        await packageService.delete(pkg.id)
                        void invalidate()
                      }}
                    >
                      Usuń
                    </Button>
                  </div>
                </header>
                {pkg.description ? (
                  <p className={styles.body}>{pkg.description}</p>
                ) : null}
                <PackageItemsEditor
                  packageId={pkg.id}
                  items={pkg.items}
                  onChanged={() => void invalidate()}
                />
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

function PackageForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: StudioPackage | null
  busy: boolean
  onCancel: () => void
  onSave: (values: {
    name: string
    description: string | null
    price: number
    depositAmount: number
    currency: string
    color: string | null
    isActive: boolean
  }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(String(initial?.price ?? ''))
  const [deposit, setDeposit] = useState(String(initial?.depositAmount ?? ''))
  const [currency, setCurrency] = useState(initial?.currency ?? 'PLN')
  const [color, setColor] = useState(initial?.color ?? '#7c5cbf')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className={styles.formCard}
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        const priceN = Number(price)
        const depositN = Number(deposit || 0)
        if (!name.trim()) {
          setError('Podaj nazwę pakietu.')
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
          depositAmount: Number.isFinite(depositN) ? depositN : 0,
          currency: currency.trim() || 'PLN',
          color: color || null,
          isActive,
        }).catch((err) =>
          setError(err instanceof Error ? err.message : 'Nie udało się zapisać.'),
        )
      }}
    >
      <h3 className={styles.formTitle}>
        {initial ? 'Edytuj pakiet' : 'Nowy pakiet'}
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
      <div className={styles.row}>
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
        <label className={styles.field}>
          <span>Zaliczka</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Waluta</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Kolor</span>
          <input
            type="color"
            value={color || '#7c5cbf'}
            onChange={(e) => setColor(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={busy}
        />
        Aktywny
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

function PackageItemsEditor({
  packageId,
  items,
  onChanged,
}: {
  packageId: string
  items: StudioPackage['items']
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  async function handleReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await packageItemService.reorder(packageId, next)
    onChanged()
  }

  return (
    <div className={styles.items}>
      <h3 className={styles.itemsTitle}>Zawartość pakietu</h3>
      <ul className={styles.itemList}>
        {items.map((item) => (
          <li
            key={item.id}
            className={styles.itemRow}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) void handleReorder(dragId, item.id)
              setDragId(null)
            }}
          >
            <span>{item.title}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                await packageItemService.delete(item.id)
                onChanged()
              }}
            >
              Usuń
            </Button>
          </li>
        ))}
      </ul>
      <form
        className={styles.itemAdd}
        onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim()) return
          await packageItemService.create({
            packageId,
            title: title.trim(),
          })
          setTitle('')
          onChanged()
        }}
      >
        <input
          placeholder="Nowa pozycja…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm">
          Dodaj
        </Button>
      </form>
    </div>
  )
}

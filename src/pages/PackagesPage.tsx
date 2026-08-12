import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { packageItemService } from '@/lib/api/packageItemService'
import { packageService } from '@/lib/api/packageService'
import { ensureReferenceWeddingSetup } from '@/lib/dev/ensureReferenceWeddingSetup'
import { ensureCompleteWeddingBriefReference } from '@/lib/dev/ensureCompleteWeddingBriefReference'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDeliveryTerm } from '@/lib/utils/commercial'
import {
  FINAL_PAYMENT_TERMS_MODE_OPTIONS,
  formatFinalPaymentTerms,
  normalizeFinalPaymentTerms,
  validateFinalPaymentTerms,
  type FinalPaymentTerms,
  type FinalPaymentTermsMode,
} from '@/lib/utils/finalPaymentTerms'
import type { PackageItem, StudioPackage } from '@/types/package'
import { PackageContractSection } from '@/features/studio/PackageContractSection'
import { PackageItemOverflowMenu } from '@/features/studio/PackageItemOverflowMenu'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  nextOpenPackageItemId,
  sanitizeOpenPackageItemId,
} from '@/features/studio/packageItemMenuState'
import styles from '@/features/studio/StudioCatalog.module.css'

type PackageFormValues = {
  name: string
  description: string | null
  price: number
  depositAmount: number
  currency: string
  color: string | null
  isActive: boolean
  coverageHours: number | null
  coverageEndTime: string | null
  overtimeRate: number | null
  deliveryMonths: number | null
  deliveryDays: number | null
  finalPaymentTerms: FinalPaymentTerms
}

export function PackagesPage() {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  const { data: packages, isLoading, isError, error, refetch, isSuccess } =
    useQuery({
      queryKey: ['studio-packages', userId],
      queryFn: () => packageService.list(),
      enabled: Boolean(userId),
    })

  const [editing, setEditing] = useState<StudioPackage | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [seedBusy, setSeedBusy] = useState(false)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio-packages'] })
    void queryClient.invalidateQueries({ queryKey: ['public-form'] })
    void queryClient.invalidateQueries({ queryKey: ['weddings'] })
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

  const ordered = [...(packages ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  async function handleReorder(fromId: string, toId: string) {
    if (!requirePro()) return
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
      subtitle="Katalog oferty — źródło cen, warunków i zawartości pakietów"
      action={
        <div className={styles.actions}>
          {import.meta.env.DEV ? (
            <>
            <Button
              type="button"
              variant="ghost"
              disabled={seedBusy}
              onClick={() => {
                setSeedBusy(true)
                setSeedMessage(null)
                void ensureReferenceWeddingSetup()
                  .then((result) => {
                    setSeedMessage(
                      result.companyReady
                        ? `Ślub referencyjny gotowy: ${result.wedding.couple.partner1} · ${result.package.name}`
                        : `Pakiet i ślub referencyjny zapisane. Uzupełnij Dane firmy, aby status był „Gotowe do umowy”.`,
                    )
                    void invalidate()
                  })
                  .catch((err) =>
                    setSeedMessage(
                      err instanceof Error
                        ? err.message
                        : 'Nie udało się utworzyć danych referencyjnych.',
                    ),
                  )
                  .finally(() => setSeedBusy(false))
              }}
            >
              {seedBusy ? 'Seed…' : 'Ślub referencyjny'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={seedBusy}
              data-testid="seed-wedding-brief-demo"
              onClick={() => {
                setSeedBusy(true)
                setSeedMessage(null)
                void ensureCompleteWeddingBriefReference()
                  .then((result) => {
                    setSeedMessage(
                      `Brief demo gotowy: ${result.wedding.couple.partner1} & ${result.wedding.couple.partner2} · ${result.package.name} · extras: ${result.extras.map((e) => e.name).join(', ') || 'brak'}`,
                    )
                    void invalidate()
                  })
                  .catch((err) =>
                    setSeedMessage(
                      err instanceof Error
                        ? err.message
                        : 'Nie udało się utworzyć ślubu brief demo.',
                    ),
                  )
                  .finally(() => setSeedBusy(false))
              }}
            >
              {seedBusy ? 'Seed…' : 'Brief demo'}
            </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="primary"
            onClick={() => requirePro(() => setCreating(true))}
          >
            Nowy pakiet
          </Button>
        </div>
      }
    >
      <PageContainer width="wide">
        {seedMessage ? <p className={styles.docHint}>{seedMessage}</p> : null}
        {isError ? (
          <EmptyState
            title="Nie udało się załadować pakietów"
            description={error instanceof Error ? error.message : 'Spróbuj ponownie.'}
          />
        ) : isLoading || !isSuccess ? (
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
                onDragStart={() => {
                  if (!requirePro()) return
                  setDragId(pkg.id)
                }}
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
                      onClick={() =>
                        requirePro(() => {
                          setCreating(false)
                          setEditing(pkg)
                        })
                      }
                    >
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        requirePro(() => {
                          void packageService.duplicate(pkg.id).then(() => invalidate())
                        })
                      }
                    >
                      Duplikuj
                    </Button>
                    {pkg.isActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          requirePro(() => {
                            void packageService.archive(pkg.id).then(() => invalidate())
                          })
                        }
                      >
                        Archiwizuj
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        requirePro(() => {
                          void (async () => {
                            if (!window.confirm('Usunąć pakiet na stałe?')) return
                            await packageService.delete(pkg.id)
                            void invalidate()
                          })()
                        })
                      }
                    >
                      Usuń
                    </Button>
                  </div>
                </header>

                <PackageDetailsSummary pkg={pkg} />

                <PackageContractSection
                  pkg={pkg}
                  onPackageUpdated={() => void invalidate()}
                />

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

function PackageDetailsSummary({ pkg }: { pkg: StudioPackage }) {
  const delivery = formatDeliveryTerm(pkg.deliveryMonths, pkg.deliveryDays)
  const updated = pkg.updatedAt
    ? new Date(pkg.updatedAt).toLocaleDateString('pl-PL')
    : '—'

  return (
    <dl className={styles.metaGrid}>
      <div>
        <dt>Cena</dt>
        <dd>{formatCurrency(pkg.price)}</dd>
      </div>
      <div>
        <dt>Zadatek</dt>
        <dd>{formatCurrency(pkg.depositAmount)}</dd>
      </div>
      <div>
        <dt>Reportaż</dt>
        <dd>
          {pkg.coverageHours != null ? `${pkg.coverageHours} h` : '—'}
          {pkg.coverageEndTime ? ` · do ${pkg.coverageEndTime}` : ''}
        </dd>
      </div>
      <div>
        <dt>Nadgodziny</dt>
        <dd>
          {pkg.overtimeRate != null ? formatCurrency(pkg.overtimeRate) : '—'}
        </dd>
      </div>
      <div>
        <dt>Oddanie</dt>
        <dd>{delivery || '—'}</dd>
      </div>
      <div>
        <dt>Płatność końcowa</dt>
        <dd>
          {formatFinalPaymentTerms(pkg.finalPaymentTerms) || '—'}
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{pkg.isActive ? 'Aktywny' : 'Zarchiwizowany'}</dd>
      </div>
      <div>
        <dt>Aktualizacja</dt>
        <dd>{updated}</dd>
      </div>
      <div>
        <dt>Pozycje</dt>
        <dd>{pkg.items.filter((i) => i.enabled).length}</dd>
      </div>
    </dl>
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
  onSave: (values: PackageFormValues) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(String(initial?.price ?? ''))
  const [deposit, setDeposit] = useState(String(initial?.depositAmount ?? ''))
  const [currency, setCurrency] = useState(initial?.currency ?? 'PLN')
  const [color, setColor] = useState(initial?.color ?? '#0a0a0a')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [coverageHours, setCoverageHours] = useState(
    initial?.coverageHours != null ? String(initial.coverageHours) : '',
  )
  const [coverageEndTime, setCoverageEndTime] = useState(
    initial?.coverageEndTime ?? '',
  )
  const [overtimeRate, setOvertimeRate] = useState(
    initial?.overtimeRate != null ? String(initial.overtimeRate) : '',
  )
  const [deliveryMonths, setDeliveryMonths] = useState(
    initial?.deliveryMonths != null ? String(initial.deliveryMonths) : '',
  )
  const [deliveryDays, setDeliveryDays] = useState(
    initial?.deliveryDays != null ? String(initial.deliveryDays) : '',
  )
  const [finalPaymentMode, setFinalPaymentMode] = useState<FinalPaymentTermsMode>(
    initial?.finalPaymentTerms?.mode ?? 'wedding_day',
  )
  const [finalPaymentValue, setFinalPaymentValue] = useState(() => {
    const terms = initial?.finalPaymentTerms
    if (
      terms &&
      (terms.mode === 'days_after_wedding' ||
        terms.mode === 'months_after_wedding')
    ) {
      return String(terms.value)
    }
    return ''
  })
  const [error, setError] = useState<string | null>(null)

  function parseOptionalNumber(raw: string): number | null {
    const t = raw.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  function buildFinalPaymentTerms(): FinalPaymentTerms | null {
    if (
      finalPaymentMode === 'days_after_wedding' ||
      finalPaymentMode === 'months_after_wedding'
    ) {
      const n = Number(finalPaymentValue)
      if (!Number.isFinite(n)) return null
      return { mode: finalPaymentMode, value: n }
    }
    return { mode: finalPaymentMode }
  }

  const needsFinalPaymentValue =
    finalPaymentMode === 'days_after_wedding' ||
    finalPaymentMode === 'months_after_wedding'

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
        const terms = buildFinalPaymentTerms()
        const termsError = validateFinalPaymentTerms(terms)
        if (termsError || !terms) {
          setError(termsError ?? 'Wybierz termin płatności końcowej.')
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
          coverageHours: parseOptionalNumber(coverageHours),
          coverageEndTime: coverageEndTime.trim() || null,
          overtimeRate: parseOptionalNumber(overtimeRate),
          deliveryMonths: parseOptionalNumber(deliveryMonths),
          deliveryDays: parseOptionalNumber(deliveryDays),
          finalPaymentTerms: normalizeFinalPaymentTerms(terms),
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

      <p className={styles.sectionLabel}>Warunki handlowe</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Cena bazowa</span>
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
          <span>Zadatek</span>
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
            value={color || '#0a0a0a'}
            onChange={(e) => setColor(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      <p className={styles.sectionLabel}>Reportaż i oddanie</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Godziny reportażu</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={coverageHours}
            onChange={(e) => setCoverageHours(e.target.value)}
            disabled={busy}
            placeholder="np. 12"
          />
        </label>
        <label className={styles.field}>
          <span>Koniec reportażu</span>
          <input
            value={coverageEndTime}
            onChange={(e) => setCoverageEndTime(e.target.value)}
            disabled={busy}
            placeholder="np. 00:30"
          />
        </label>
        <label className={styles.field}>
          <span>Stawka nadgodzin</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={overtimeRate}
            onChange={(e) => setOvertimeRate(e.target.value)}
            disabled={busy}
            placeholder="np. 1400"
          />
        </label>
        <label className={styles.field}>
          <span>Oddanie (miesiące)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={deliveryMonths}
            onChange={(e) => setDeliveryMonths(e.target.value)}
            disabled={busy}
            placeholder="np. 4"
          />
        </label>
        <label className={styles.field}>
          <span>Oddanie (dni)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
            disabled={busy}
            placeholder="opcjonalnie"
          />
        </label>
      </div>

      <p className={styles.sectionLabel}>Termin płatności końcowej</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Tryb</span>
          <select
            value={finalPaymentMode}
            onChange={(e) =>
              setFinalPaymentMode(e.target.value as FinalPaymentTermsMode)
            }
            disabled={busy}
          >
            {FINAL_PAYMENT_TERMS_MODE_OPTIONS.map((opt) => (
              <option key={opt.mode} value={opt.mode}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {needsFinalPaymentValue ? (
          <label className={styles.field}>
            <span>
              {finalPaymentMode === 'days_after_wedding'
                ? 'Liczba dni'
                : 'Liczba miesięcy'}
            </span>
            <input
              type="number"
              min={1}
              step="1"
              value={finalPaymentValue}
              onChange={(e) => setFinalPaymentValue(e.target.value)}
              disabled={busy}
              placeholder={
                finalPaymentMode === 'days_after_wedding' ? 'np. 14' : 'np. 3'
              }
            />
          </label>
        ) : null}
      </div>
      {needsFinalPaymentValue && finalPaymentValue.trim() ? (
        <p className={styles.muted}>
          {formatFinalPaymentTerms(buildFinalPaymentTerms())}
        </p>
      ) : null}

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
  items: PackageItem[]
  onChanged: () => void
}) {
  const { requirePro } = useProAccessGate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editCategory, setEditCategory] = useState('')

  useEffect(() => {
    setOpenItemId((current) =>
      sanitizeOpenPackageItemId(
        current,
        items.map((item) => item.id),
      ),
    )
  }, [items])

  async function handleReorder(fromId: string, toId: string) {
    if (!requirePro()) return
    if (fromId === toId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOpenItemId(null)
    await packageItemService.reorder(packageId, next)
    onChanged()
  }

  function beginEdit(item: PackageItem) {
    setOpenItemId(null)
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setEditQuantity(item.quantity != null ? String(item.quantity) : '')
    setEditUnit(item.unit ?? '')
    setEditCategory(item.category ?? '')
  }

  return (
    <div className={styles.items}>
      <h3 className={styles.itemsTitle}>Zawartość pakietu</h3>
      <ul className={styles.itemList}>
        {items.map((item) => (
          <li
            key={item.id}
            className={`${styles.itemRow} ${!item.enabled ? styles.itemDisabled : ''}`}
            draggable={editingId !== item.id}
            onDragStart={() => {
              if (!requirePro()) return
              setDragId(item.id)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) void handleReorder(dragId, item.id)
              setDragId(null)
            }}
          >
            {editingId === item.id ? (
              <div className={styles.itemEdit}>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Nazwa pozycji"
                />
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Opis (opcjonalnie)"
                />
                <div className={styles.row}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    placeholder="Ilość"
                  />
                  <input
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    placeholder="Jednostka"
                  />
                  <input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Kategoria"
                  />
                </div>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Anuluj
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      if (!editTitle.trim()) return
                      const qty = editQuantity.trim()
                        ? Number(editQuantity)
                        : null
                      await packageItemService.update(item.id, {
                        title: editTitle.trim(),
                        description: editDescription.trim() || null,
                        quantity:
                          qty != null && Number.isFinite(qty) ? qty : null,
                        unit: editUnit.trim() || null,
                        category: editCategory.trim() || null,
                      })
                      setEditingId(null)
                      onChanged()
                    }}
                  >
                    Zapisz pozycję
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{item.title}</span>
                  {item.description ? (
                    <span className={styles.itemMeta}>{item.description}</span>
                  ) : null}
                  {(() => {
                    const meta = [
                      item.quantity != null
                        ? `× ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
                        : null,
                      item.category,
                      item.enabled ? null : 'wyłączona',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return meta ? (
                      <span className={styles.itemMeta}>{meta}</span>
                    ) : null
                  })()}
                </div>
                <div className={`${styles.actions} ${styles.itemActionsDesktop}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => requirePro(() => beginEdit(item))}
                  >
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      requirePro(() => {
                        void packageItemService
                          .update(item.id, { enabled: !item.enabled })
                          .then(() => onChanged())
                      })
                    }
                  >
                    {item.enabled ? 'Wyłącz' : 'Włącz'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      requirePro(() => {
                        void packageItemService.delete(item.id).then(() => onChanged())
                      })
                    }
                  >
                    Usuń
                  </Button>
                </div>
                <PackageItemOverflowMenu
                  open={openItemId === item.id}
                  onOpenChange={(open) =>
                    setOpenItemId((current) =>
                      nextOpenPackageItemId(current, item.id, open),
                    )
                  }
                  enabled={item.enabled}
                  onEdit={() => requirePro(() => beginEdit(item))}
                  onToggleEnabled={() => {
                    requirePro(() => {
                      setOpenItemId(null)
                      void packageItemService
                        .update(item.id, { enabled: !item.enabled })
                        .then(() => onChanged())
                    })
                  }}
                  onDelete={() => {
                    requirePro(() => {
                      setOpenItemId(null)
                      void packageItemService
                        .delete(item.id)
                        .then(() => onChanged())
                    })
                  }}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className={styles.itemAdd}
        onSubmit={(e) => {
          e.preventDefault()
          requirePro(() => {
            void (async () => {
              if (!title.trim()) return
              await packageItemService.create({
                packageId,
                title: title.trim(),
                description: description.trim() || null,
              })
              setTitle('')
              setDescription('')
              onChanged()
            })()
          })
        }}
      >
        <input
          placeholder="Nowa pozycja…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          placeholder="Opis (opcjonalnie)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm">
          Dodaj
        </Button>
      </form>
      <p className={styles.muted}>
        Usługi dodatkowe (opcjonalne) konfigurujesz w katalogu „Usługi”, a
        przypisujesz je per ślub.
      </p>
    </div>
  )
}

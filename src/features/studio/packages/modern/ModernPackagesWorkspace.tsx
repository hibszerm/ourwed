import { useState } from 'react'
import { Archive, Copy, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PackageContractSection } from '@/features/studio/PackageContractSection'
import { PackageItemOverflowMenu } from '@/features/studio/PackageItemOverflowMenu'
import {
  nextOpenPackageItemId,
  sanitizeOpenPackageItemId,
} from '@/features/studio/packageItemMenuState'
import {
  PACKAGES_ADD_LABEL,
  PACKAGES_DELETE_CONFIRM,
  PACKAGES_EMPTY_COPY,
  PACKAGES_EMPTY_TITLE,
  PACKAGES_ERROR_RETRY,
  PACKAGES_ERROR_TITLE,
  PACKAGES_EXTRAS_HINT,
  PACKAGES_SKELETON_CARDS,
  PACKAGES_SUBTITLE,
  PACKAGES_TITLE,
} from '@/features/studio/packages/modern/packagesCopy'
import { packageItemService } from '@/lib/api/packageItemService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
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
import {
  readDeliveryTermForm,
  writeDeliveryTermForm,
  type DeliveryTermUnit,
} from '@/lib/utils/weddingDeliveryDeadline'
import { DEFAULT_PACKAGE_COLOR, type PackageItem, type StudioPackage } from '@/types/package'
import styles from './ModernPackagesWorkspace.module.css'

export type PackageFormValues = {
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

interface ModernPackagesWorkspaceProps {
  packages: StudioPackage[]
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
  saveBusy: boolean
  canMutate: (action?: () => void) => boolean
  onCreate: (values: PackageFormValues) => Promise<void>
  onUpdate: (id: string, values: PackageFormValues) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (fromId: string, toId: string) => Promise<void>
  onPackageUpdated: () => void
}

export function ModernPackagesWorkspace({
  packages,
  isLoading,
  isError,
  error,
  onRetry,
  saveBusy,
  canMutate,
  onCreate,
  onUpdate,
  onDuplicate,
  onArchive,
  onDelete,
  onReorder,
  onPackageUpdated,
}: ModernPackagesWorkspaceProps) {
  const [editing, setEditing] = useState<StudioPackage | null>(null)
  const [creating, setCreating] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const ordered = [...packages].sort((a, b) => a.sortOrder - b.sortOrder)
  const showEmpty = !isLoading && !isError && ordered.length === 0 && !creating
  const studioHasLinkedTemplate = ordered.some((pkg) =>
    Boolean(pkg.activeContractTemplateId),
  )

  return (
    <div className={styles.page} data-testid="packages-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{PACKAGES_TITLE}</h1>
          <p className={styles.lead}>{PACKAGES_SUBTITLE}</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="primary"
            className={styles.createAction}
            onClick={() => canMutate(() => setCreating(true))}
          >
            {PACKAGES_ADD_LABEL}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div
          className={styles.skeleton}
          aria-hidden
          data-testid="packages-loading"
        >
          {Array.from({ length: PACKAGES_SKELETON_CARDS }, (_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader} />
              <div className={styles.skeletonMeta}>
                <span className={styles.skeletonFact} />
                <span className={styles.skeletonFact} />
                <span className={styles.skeletonFact} />
                <span className={styles.skeletonFact} />
                <span className={styles.skeletonFact} />
              </div>
              <div className={styles.skeletonBlock} />
              <div className={styles.skeletonBlock} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className={styles.stateSurface} data-testid="packages-error">
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{PACKAGES_ERROR_TITLE}</p>
            <p className={styles.emptyDesc}>
              {getUserFacingErrorMessage(error, 'Spróbuj ponownie.')}
            </p>
            <Button
              type="button"
              variant="secondary"
              className={styles.retry}
              onClick={onRetry}
            >
              {PACKAGES_ERROR_RETRY}
            </Button>
          </div>
        </div>
      ) : showEmpty ? (
        <div className={styles.stateSurface} data-testid="packages-empty">
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{PACKAGES_EMPTY_TITLE}</p>
            <p className={styles.emptyDesc}>{PACKAGES_EMPTY_COPY}</p>
          </div>
        </div>
      ) : (
        <div className={styles.catalog} data-testid="packages-catalog">
          {(creating || editing) && (
            <PackageForm
              initial={editing}
              busy={saveBusy}
              onCancel={() => {
                setCreating(false)
                setEditing(null)
              }}
              onSave={async (values) => {
                if (editing) {
                  await onUpdate(editing.id, values)
                  setEditing(null)
                } else {
                  await onCreate(values)
                  setCreating(false)
                  window.setTimeout(() => {
                    document
                      .querySelector<HTMLElement>(
                        '[data-testid="package-contract-next-step"]',
                      )
                      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  }, 80)
                }
              }}
            />
          )}

          {ordered.map((pkg) => (
            <article
              key={pkg.id}
              className={`${styles.card} ${pkg.isActive ? '' : styles.cardArchived}`}
              data-testid="packages-card"
              draggable
              onDragStart={() => {
                if (!canMutate()) return
                setDragId(pkg.id)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragId) void onReorder(dragId, pkg.id)
                setDragId(null)
              }}
            >
              <header className={styles.cardHeader}>
                <div className={styles.identity}>
                  <span
                    className={styles.swatch}
                    style={{
                      background:
                        pkg.color || 'var(--color-text-tertiary)',
                    }}
                    aria-hidden
                  />
                  <div className={styles.identityText}>
                    <h2 className={styles.cardTitle}>{pkg.name}</h2>
                    <p className={styles.priceLine}>
                      {formatCurrency(pkg.price)}
                      {' · zadatek '}
                      {formatCurrency(pkg.depositAmount)}
                      {!pkg.isActive ? ' · zarchiwizowany' : ''}
                    </p>
                    {pkg.description?.trim() ? (
                      <p className={styles.description}>{pkg.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      canMutate(() => {
                        setCreating(false)
                        setEditing(pkg)
                      })
                    }
                  >
                    <Pencil
                      className={styles.actionIcon}
                      aria-hidden
                      width={15}
                      height={15}
                      strokeWidth={1.75}
                    />
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      canMutate(() => {
                        void onDuplicate(pkg.id)
                      })
                    }
                  >
                    <Copy
                      className={styles.actionIcon}
                      aria-hidden
                      width={15}
                      height={15}
                      strokeWidth={1.75}
                    />
                    Duplikuj
                  </Button>
                  {pkg.isActive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        canMutate(() => {
                          void onArchive(pkg.id)
                        })
                      }
                    >
                      <Archive
                        className={styles.actionIcon}
                        aria-hidden
                        width={15}
                        height={15}
                        strokeWidth={1.75}
                      />
                      Archiwizuj
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className={styles.actionDanger}
                    onClick={() =>
                      canMutate(() => {
                        void (async () => {
                          if (!window.confirm(PACKAGES_DELETE_CONFIRM)) return
                          await onDelete(pkg.id)
                        })()
                      })
                    }
                  >
                    <Trash2
                      className={styles.actionIcon}
                      aria-hidden
                      width={15}
                      height={15}
                      strokeWidth={1.75}
                    />
                    Usuń
                  </Button>
                </div>
              </header>

              <PackageDetailsSummary pkg={pkg} />

              <div
                className={styles.contractSlot}
                data-has-template={
                  pkg.activeContractTemplateId ? 'true' : 'false'
                }
              >
                <PackageContractSection
                  pkg={pkg}
                  onPackageUpdated={onPackageUpdated}
                  emphasizeNextStep={
                    !pkg.activeContractTemplateId && !studioHasLinkedTemplate
                  }
                />
              </div>

              <PackageItemsEditor
                packageId={pkg.id}
                items={pkg.items}
                canMutate={canMutate}
                onChanged={onPackageUpdated}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function PackageDetailsSummary({ pkg }: { pkg: StudioPackage }) {
  const delivery = formatDeliveryTerm(pkg.deliveryMonths, pkg.deliveryDays)

  return (
    <dl className={styles.metaGrid}>
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
        <dd>{formatFinalPaymentTerms(pkg.finalPaymentTerms) || '—'}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{pkg.isActive ? 'Aktywny' : 'Zarchiwizowany'}</dd>
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
  const [color, setColor] = useState(initial?.color ?? DEFAULT_PACKAGE_COLOR)
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
  const initialDelivery = readDeliveryTermForm(
    initial?.deliveryMonths,
    initial?.deliveryDays,
  )
  const [deliveryTermValue, setDeliveryTermValue] = useState(
    initialDelivery.value,
  )
  const [deliveryTermUnit, setDeliveryTermUnit] = useState<DeliveryTermUnit>(
    initialDelivery.unit,
  )
  const [finalPaymentMode, setFinalPaymentMode] =
    useState<FinalPaymentTermsMode>(
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
    const trimmed = raw.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
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
      data-testid={initial ? 'packages-edit-form' : 'packages-create-form'}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault()
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
        const deliveryTerm = writeDeliveryTermForm(
          deliveryTermUnit,
          deliveryTermValue,
        )
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
          deliveryMonths: deliveryTerm.deliveryMonths,
          deliveryDays: deliveryTerm.deliveryDays,
          finalPaymentTerms: normalizeFinalPaymentTerms(terms),
        }).catch((err) =>
          setError(getUserFacingErrorMessage(err, 'Nie udało się zapisać.')),
        )
      }}
    >
      <h3 className={styles.formTitle}>
        {initial ? 'Edytuj pakiet' : 'Nowy pakiet'}
      </h3>
      <div className={styles.formGrid}>
        <div className={styles.formFull}>
          <Input
            label="Nazwa"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>
        <div className={styles.formFull}>
          <Textarea
            label="Opis"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            disabled={busy}
          />
        </div>
      </div>

      <p className={styles.sectionLabel}>Warunki handlowe</p>
      <div className={styles.formGrid}>
        <Input
          label="Cena bazowa"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={busy}
        />
        <Input
          label="Zadatek"
          type="number"
          min={0}
          step="0.01"
          value={deposit}
          onChange={(event) => setDeposit(event.target.value)}
          disabled={busy}
        />
        <Input
          label="Waluta"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          disabled={busy}
        />
        <label className={styles.colorField}>
          <span>Kolor</span>
          <input
            type="color"
            value={color || DEFAULT_PACKAGE_COLOR}
            onChange={(event) => setColor(event.target.value)}
            disabled={busy}
            aria-label="Kolor"
          />
        </label>
      </div>

      <p className={styles.sectionLabel}>Reportaż i oddanie</p>
      <div className={styles.formGrid}>
        <Input
          label="Godziny reportażu"
          type="number"
          min={0}
          step="0.5"
          value={coverageHours}
          onChange={(event) => setCoverageHours(event.target.value)}
          disabled={busy}
          placeholder="np. 12"
        />
        <Input
          label="Koniec reportażu"
          value={coverageEndTime}
          onChange={(event) => setCoverageEndTime(event.target.value)}
          disabled={busy}
          placeholder="np. 00:30"
        />
        <Input
          label="Stawka nadgodzin"
          type="number"
          min={0}
          step="0.01"
          value={overtimeRate}
          onChange={(event) => setOvertimeRate(event.target.value)}
          disabled={busy}
          placeholder="np. 1400"
        />
        <Input
          label="Termin oddania"
          type="number"
          min={1}
          step="1"
          value={deliveryTermValue}
          onChange={(event) => setDeliveryTermValue(event.target.value)}
          disabled={busy}
          placeholder="np. 5"
          data-testid="package-delivery-term-value"
        />
        <Select
          label="Jednostka"
          value={deliveryTermUnit}
          onChange={(event) =>
            setDeliveryTermUnit(event.target.value as DeliveryTermUnit)
          }
          disabled={busy}
          data-testid="package-delivery-term-unit"
        >
          <option value="months">miesięcy</option>
          <option value="calendar_days">dni kalendarzowych</option>
        </Select>
      </div>

      <p className={styles.sectionLabel}>Termin płatności końcowej</p>
      <div className={styles.formGrid}>
        <Select
          label="Tryb"
          value={finalPaymentMode}
          onChange={(event) =>
            setFinalPaymentMode(event.target.value as FinalPaymentTermsMode)
          }
          disabled={busy}
        >
          {FINAL_PAYMENT_TERMS_MODE_OPTIONS.map((opt) => (
            <option key={opt.mode} value={opt.mode}>
              {opt.label}
            </option>
          ))}
        </Select>
        {needsFinalPaymentValue ? (
          <Input
            label={
              finalPaymentMode === 'days_after_wedding'
                ? 'Liczba dni'
                : 'Liczba miesięcy'
            }
            type="number"
            min={1}
            step="1"
            value={finalPaymentValue}
            onChange={(event) => setFinalPaymentValue(event.target.value)}
            disabled={busy}
            placeholder={
              finalPaymentMode === 'days_after_wedding' ? 'np. 14' : 'np. 3'
            }
          />
        ) : null}
      </div>
      {needsFinalPaymentValue && finalPaymentValue.trim() ? (
        <p className={styles.formPreview}>
          {formatFinalPaymentTerms(buildFinalPaymentTerms())}
        </p>
      ) : null}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          disabled={busy}
        />
        Aktywny
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.formActions}>
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
  canMutate,
  onChanged,
}: {
  packageId: string
  items: PackageItem[]
  canMutate: (action?: () => void) => boolean
  onChanged: () => void
}) {
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
  const visibleOpenItemId = sanitizeOpenPackageItemId(
    openItemId,
    items.map((item) => item.id),
  )

  async function handleReorder(fromId: string, toId: string) {
    if (!canMutate()) return
    if (fromId === toId) return
    const ids = items.map((item) => item.id)
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
              if (!canMutate()) return
              setDragId(item.id)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragId) void handleReorder(dragId, item.id)
              setDragId(null)
            }}
          >
            {editingId === item.id ? (
              <div className={styles.itemEdit}>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="Nazwa pozycji"
                />
                <input
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Opis (opcjonalnie)"
                />
                <div className={styles.formGrid}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editQuantity}
                    onChange={(event) => setEditQuantity(event.target.value)}
                    placeholder="Ilość"
                  />
                  <input
                    value={editUnit}
                    onChange={(event) => setEditUnit(event.target.value)}
                    placeholder="Jednostka"
                  />
                  <input
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                    placeholder="Kategoria"
                  />
                </div>
                <div className={styles.formActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Anuluj
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
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
                <div className={styles.itemActionsDesktop}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => canMutate(() => beginEdit(item))}
                  >
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      canMutate(() => {
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
                    className={styles.actionDanger}
                    onClick={() =>
                      canMutate(() => {
                        void packageItemService
                          .delete(item.id)
                          .then(() => onChanged())
                      })
                    }
                  >
                    Usuń
                  </Button>
                </div>
                <PackageItemOverflowMenu
                  open={visibleOpenItemId === item.id}
                  onOpenChange={(open) =>
                    setOpenItemId((current) =>
                      nextOpenPackageItemId(current, item.id, open),
                    )
                  }
                  enabled={item.enabled}
                  onEdit={() => canMutate(() => beginEdit(item))}
                  onToggleEnabled={() => {
                    canMutate(() => {
                      setOpenItemId(null)
                      void packageItemService
                        .update(item.id, { enabled: !item.enabled })
                        .then(() => onChanged())
                    })
                  }}
                  onDelete={() => {
                    canMutate(() => {
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
        onSubmit={(event) => {
          event.preventDefault()
          canMutate(() => {
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
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          placeholder="Opis (opcjonalnie)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Dodaj
        </Button>
      </form>
      <p className={styles.extrasHint}>{PACKAGES_EXTRAS_HINT}</p>
    </div>
  )
}

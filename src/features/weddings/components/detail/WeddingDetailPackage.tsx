import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { packageService } from '@/lib/api/packageService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import {
  applyCommercialPackageSnapshot,
  fillWeddingTermsFromCatalogPackage,
  formatDeliveryTerm,
} from '@/lib/utils/commercial'
import { formatFinalPaymentTerms } from '@/lib/utils/finalPaymentTerms'
import { formatCurrency } from '@/lib/utils/currency'
import type { StudioPackage, WeddingExtraService } from '@/types/package'
import type { Wedding, WeddingPackageItemSnapshot } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailPackage.module.css'

interface WeddingDetailPackageProps {
  wedding: Wedding
  editing?: boolean
  extras?: WeddingExtraService[]
  packageBasePrice?: number
  onChangeWedding?: (patch: Partial<Wedding>) => void
  onChangeExtras?: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice?: (price: number) => void
}

type PendingPackageChange = {
  pkg: StudioPackage
  extrasTotal: number
}

export function WeddingDetailPackage({
  wedding,
  editing = false,
  extras: extrasProp,
  packageBasePrice,
  onChangeWedding,
  onChangeExtras,
  onChangePackageBasePrice,
}: WeddingDetailPackageProps) {
  const userId = useStudioAuthId()
  const [pendingChange, setPendingChange] = useState<PendingPackageChange | null>(
    null,
  )
  const [itemsOpen, setItemsOpen] = useState(false)

  const { data: remoteExtras = [], isLoading: extrasLoading } = useQuery({
    queryKey: ['wedding-extras', userId, wedding.id],
    queryFn: () => weddingExtraServiceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId) && !editing,
  })

  const {
    data: catalogPackages,
    isPending: catalogPackagesPending,
    isSuccess: catalogPackagesSuccess,
  } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: Boolean(userId) && editing,
  })

  const { data: catalogExtras = [] } = useQuery({
    queryKey: ['studio-extra-services', userId, 'active'],
    queryFn: () => extraServiceService.list({ activeOnly: true }),
    enabled: Boolean(userId) && editing,
  })

  const extras = editing ? (extrasProp ?? []) : remoteExtras
  const availableExtras = catalogExtras.filter(
    (s) => !extras.some((e) => e.extraServiceId === s.id),
  )
  const packageChoices =
    catalogPackagesSuccess && catalogPackages ? catalogPackages : undefined

  const allSnapshotItems = wedding.packageItems ?? []
  const snapshotItems = allSnapshotItems.filter((item) => item.enabled !== false)
  const delivery = formatDeliveryTerm(
    wedding.deliveryMonths,
    wedding.deliveryDays,
  )

  function requestPackageChange(packageId: string) {
    if (!packageChoices || !onChangeWedding) return
    const selected = packageChoices.find((p) => p.id === packageId)
    if (!selected) return
    const extrasTotal = extras.reduce(
      (sum, e) => sum + e.priceSnapshot * e.quantity,
      0,
    )
    const hasExisting =
      Boolean(wedding.packageId) ||
      Boolean(wedding.packageName) ||
      (wedding.packageItems?.length ?? 0) > 0
    if (hasExisting && wedding.packageId !== selected.id) {
      setPendingChange({ pkg: selected, extrasTotal })
      return
    }
    commitPackageChange(selected, extrasTotal, false)
  }

  function commitPackageChange(
    pkg: StudioPackage,
    extrasTotal: number,
    preserveContractValue: boolean,
  ) {
    onChangePackageBasePrice?.(
      preserveContractValue
        ? Math.max(0, wedding.price - extrasTotal)
        : pkg.price,
    )
    onChangeWedding?.(
      applyCommercialPackageSnapshot(wedding, pkg, {
        extrasTotal,
        preserveContractValue,
      }),
    )
    setPendingChange(null)
  }

  function fillFromCatalog(preserveContractValue: boolean) {
    if (!packageChoices || !wedding.packageId || !onChangeWedding) return
    const selected = packageChoices.find((p) => p.id === wedding.packageId)
    if (!selected) return
    if (
      !window.confirm(
        'Uzupełnić brakujące warunki z aktualnego pakietu katalogu? Zastąpi to zapisany snapshot zawartości i warunków (poza ewentualnie zachowaną wartością umowy).',
      )
    ) {
      return
    }
    const extrasTotal = extras.reduce(
      (sum, e) => sum + e.priceSnapshot * e.quantity,
      0,
    )
    onChangePackageBasePrice?.(
      preserveContractValue
        ? Math.max(0, wedding.price - extrasTotal)
        : selected.price,
    )
    onChangeWedding?.(
      fillWeddingTermsFromCatalogPackage(wedding, selected, {
        preserveContractValue,
        extrasTotal,
      }),
    )
  }

  function updateExtra(id: string, patch: Partial<WeddingExtraService>) {
    if (!onChangeExtras) return
    const next = extras.map((e) => (e.id === id ? { ...e, ...patch } : e))
    onChangeExtras(next)
    const base =
      packageBasePrice ??
      Math.max(
        0,
        wedding.price -
          extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0),
      )
    onChangeWedding?.({
      price:
        base + next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  function removeExtra(id: string) {
    if (!onChangeExtras) return
    const next = extras.filter((e) => e.id !== id)
    onChangeExtras(next)
    const base =
      packageBasePrice ??
      Math.max(
        0,
        wedding.price -
          extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0),
      )
    onChangeWedding?.({
      price:
        base + next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  async function addExtra(extraServiceId: string) {
    if (!onChangeExtras || !extraServiceId) return
    const service = catalogExtras.find((s) => s.id === extraServiceId)
    if (!service) return
    const created: WeddingExtraService = {
      id: `temp-${crypto.randomUUID()}`,
      weddingId: wedding.id,
      extraServiceId: service.id,
      priceSnapshot: service.price,
      quantity: 1,
      createdAt: new Date().toISOString(),
      name: service.name,
    }
    const next = [...extras, created]
    onChangeExtras(next)
    const base =
      packageBasePrice ??
      Math.max(
        0,
        wedding.price -
          extras.reduce((s, e) => s + e.priceSnapshot * e.quantity, 0),
      )
    onChangeWedding?.({
      price:
        base + next.reduce((sum, e) => sum + e.priceSnapshot * e.quantity, 0),
    })
  }

  function updateSnapshotItem(
    index: number,
    patch: Partial<WeddingPackageItemSnapshot>,
  ) {
    const next = [...(wedding.packageItems ?? [])]
    const current = next[index]
    if (!current) return
    next[index] = { ...current, ...patch }
    onChangeWedding?.({ packageItems: next })
  }

  function removeSnapshotItem(index: number) {
    const next = (wedding.packageItems ?? []).filter((_, i) => i !== index)
    onChangeWedding?.({ packageItems: next })
  }

  function addSnapshotItem() {
    const next = [
      ...(wedding.packageItems ?? []),
      {
        sourceItemId: null,
        title: 'Nowa pozycja',
        description: null,
        sortOrder: wedding.packageItems?.length ?? 0,
        enabled: true,
      } satisfies WeddingPackageItemSnapshot,
    ]
    onChangeWedding?.({ packageItems: next })
  }

  return (
    <Card>
      <CardHeader title="Pakiet (snapshot)" />
      {pendingChange ? (
        <div className={styles.confirm}>
          <p className={styles.confirmTitle}>
            Zmiana pakietu zastąpi zapisane warunki pakietu dla tego ślubu.
          </p>
          <p className={styles.hint}>
            Nowy pakiet: <strong>{pendingChange.pkg.name}</strong> (
            {formatCurrency(pendingChange.pkg.price)})
          </p>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() =>
                commitPackageChange(
                  pendingChange.pkg,
                  pendingChange.extrasTotal,
                  false,
                )
              }
            >
              Zastosuj domyślne pakietu
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                commitPackageChange(
                  pendingChange.pkg,
                  pendingChange.extrasTotal,
                  true,
                )
              }
            >
              Zachowaj wartość umowy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPendingChange(null)}
            >
              Anuluj
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className={editStyles.fieldGrid}>
          <Select
            label="Pakiet"
            value={wedding.packageId ?? ''}
            onChange={(e) => requestPackageChange(e.target.value)}
            disabled={catalogPackagesPending || !packageChoices}
          >
            <option value="">
              {catalogPackagesPending
                ? 'Ładowanie pakietów…'
                : snapshotItems.length === 0
                  ? 'Ponownie przypisz pakiet…'
                  : 'Wybierz pakiet…'}
            </option>
            {packageChoices?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(p.price)}
              </option>
            ))}
          </Select>
          <Input
            label="Wartość umowy"
            type="number"
            min={0}
            step="0.01"
            value={wedding.price}
            onChange={(e) =>
              onChangeWedding?.({ price: Number(e.target.value) || 0 })
            }
          />
          <Input
            label="Zaliczka uzgodniona"
            type="number"
            min={0}
            step="0.01"
            value={wedding.depositAmount ?? 0}
            onChange={(e) =>
              onChangeWedding?.({
                depositAmount: Number(e.target.value) || 0,
              })
            }
          />
          <Input
            label="Godziny reportażu"
            type="number"
            min={0}
            step="0.5"
            value={wedding.coverageHours ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                coverageHours: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
          />
          <Input
            label="Koniec reportażu"
            value={wedding.coverageEndTime ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                coverageEndTime: e.target.value.trim() || null,
              })
            }
            placeholder="np. 00:30"
          />
          <Input
            label="Stawka nadgodzin"
            type="number"
            min={0}
            step="0.01"
            value={wedding.overtimeRate ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                overtimeRate: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <Input
            label="Oddanie (miesiące)"
            type="number"
            min={0}
            step="1"
            value={wedding.deliveryMonths ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                deliveryMonths: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
          />
          <Input
            label="Oddanie (dni)"
            type="number"
            min={0}
            step="1"
            value={wedding.deliveryDays ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                deliveryDays: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <Input
            label="Termin płatności końcowej"
            type="date"
            value={wedding.finalPaymentDueDate ?? ''}
            onChange={(e) =>
              onChangeWedding?.({
                finalPaymentDueDate: e.target.value || null,
              })
            }
          />
          <Input label="Waluta" value={wedding.currency || 'PLN'} readOnly />
        </div>
      ) : (
        <dl className={styles.list}>
          <div>
            <dt>Nazwa</dt>
            <dd>{wedding.packageName || '—'}</dd>
          </div>
          <div>
            <dt>Wartość umowy</dt>
            <dd>{formatCurrency(wedding.price)}</dd>
          </div>
          <div>
            <dt>Zaliczka uzgodniona</dt>
            <dd>
              {wedding.depositAmount != null
                ? formatCurrency(wedding.depositAmount)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Reportaż</dt>
            <dd>
              {wedding.coverageHours != null
                ? `${wedding.coverageHours} h`
                : '—'}
              {wedding.coverageEndTime
                ? ` · do ${wedding.coverageEndTime}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>Nadgodziny</dt>
            <dd>
              {wedding.overtimeRate != null
                ? formatCurrency(wedding.overtimeRate)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Termin oddania</dt>
            <dd>{delivery || '—'}</dd>
          </div>
          <div>
            <dt>Płatność końcowa</dt>
            <dd>
              {formatFinalPaymentTerms(wedding.finalPaymentTerms) ||
                wedding.finalPaymentDueDate ||
                '—'}
            </dd>
          </div>
          <div>
            <dt>Waluta</dt>
            <dd>{wedding.currency || 'PLN'}</dd>
          </div>
        </dl>
      )}

      <div className={styles.items}>
        <h3 className={styles.itemsTitle}>Zawartość pakietu</h3>
        {(editing ? allSnapshotItems : snapshotItems).length === 0 ? (
          <p className={styles.hint}>
            Ten ślub nie ma zapisanego snapshotu zawartości pakietu.
          </p>
        ) : (
          <ul>
            {(editing ? allSnapshotItems : snapshotItems).map((item, index) => (
              <li key={item.sourceItemId ?? `${item.title}-${index}`}>
                {editing ? (
                  <div className={styles.itemEditRow}>
                    <Input
                      label="Pozycja"
                      value={item.title}
                      onChange={(e) =>
                        updateSnapshotItem(index, { title: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSnapshotItem(index)}
                    >
                      Usuń
                    </Button>
                  </div>
                ) : (
                  item.title
                )}
              </li>
            ))}
          </ul>
        )}
        {editing ? (
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addSnapshotItem}
            >
              Dodaj pozycję snapshotu
            </Button>
            {wedding.packageId ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fillFromCatalog(false)}
                >
                  Uzupełnij z aktualnego pakietu
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fillFromCatalog(true)}
                >
                  Uzupełnij (zachowaj cenę)
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.items}>
        <h3 className={styles.itemsTitle}>Usługi dodatkowe</h3>
        {!editing && extrasLoading ? (
          <p className={styles.hint}>Ładowanie…</p>
        ) : extras.length === 0 ? (
          <p className={styles.hint}>Brak wybranych usług dodatkowych.</p>
        ) : (
          <ul className={editStyles.inlineList}>
            {extras.map((extra) => (
              <li
                key={extra.id}
                className={editing ? editStyles.inlineItem : undefined}
              >
                {editing ? (
                  <>
                    <strong>{extra.name ?? 'Usługa'}</strong>
                    <div className={editStyles.fieldRow}>
                      <Input
                        label="Ilość"
                        type="number"
                        min={1}
                        value={extra.quantity}
                        onChange={(e) =>
                          updateExtra(extra.id, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                      <Input
                        label="Cena (snapshot)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={extra.priceSnapshot}
                        onChange={(e) =>
                          updateExtra(extra.id, {
                            priceSnapshot: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExtra(extra.id)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </>
                ) : (
                  <span>
                    {extra.name ?? 'Usługa'} · {extra.quantity} ×{' '}
                    {formatCurrency(extra.priceSnapshot)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {editing && availableExtras.length > 0 ? (
          <div className={styles.addRow}>
            <select
              className={styles.select}
              defaultValue=""
              onChange={(e) => {
                void addExtra(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Dodaj usługę dodatkową…</option>
              {availableExtras.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {formatCurrency(s.price)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {!editing && snapshotItems.length > 0 ? (
        <div className={styles.items}>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setItemsOpen((v) => !v)}
          >
            {itemsOpen ? 'Ukryj szczegóły pozycji' : 'Pokaż szczegóły pozycji'}
          </button>
          {itemsOpen ? (
            <ul>
              {snapshotItems.map((item, index) => (
                <li key={`detail-${item.sourceItemId ?? index}`}>
                  {item.title}
                  {item.description ? ` — ${item.description}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

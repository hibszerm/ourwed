import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { packageService } from '@/lib/api/packageService'
import {
  applyCommercialPackageSnapshot,
  fillWeddingTermsFromCatalogPackage,
} from '@/lib/utils/commercial'
import {
  FINAL_PAYMENT_TERMS_MODE_OPTIONS,
  resolveFinalPaymentDueDate,
} from '@/lib/utils/finalPaymentTerms'
import { formatCurrency } from '@/lib/utils/currency'
import type { StudioPackage, WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

/** Shared package edit fields — no V1 Card / hero wrappers. */
export function PackageFields({
  wedding,
  extras,
  packageBasePrice,
  onChangeWedding,
  onChangeExtras,
  onChangePackageBasePrice,
}: {
  wedding: Wedding
  extras: WeddingExtraService[]
  packageBasePrice?: number
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangeExtras: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice: (price: number) => void
}) {
  const userId = useStudioAuthId()
  const [pendingChange, setPendingChange] = useState<{
    pkg: StudioPackage
    extrasTotal: number
  } | null>(null)

  const { data: catalogPackages, isPending: catalogPending } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: Boolean(userId),
  })
  const { data: catalogExtras = [] } = useQuery({
    queryKey: ['studio-extra-services', userId, 'active'],
    queryFn: () => extraServiceService.list({ activeOnly: true }),
    enabled: Boolean(userId),
  })

  const packageChoices = catalogPackages ?? []
  const availableExtras = catalogExtras.filter(
    (s) => !extras.some((e) => e.extraServiceId === s.id),
  )
  const snapshotItems = (wedding.packageItems ?? []).filter(
    (i) => i.enabled !== false,
  )

  function commitPackageChange(
    pkg: StudioPackage,
    extrasTotal: number,
    preserveContractValue: boolean,
  ) {
    onChangePackageBasePrice(
      preserveContractValue
        ? Math.max(0, wedding.price - extrasTotal)
        : pkg.price,
    )
    onChangeWedding(
      applyCommercialPackageSnapshot(wedding, pkg, {
        extrasTotal,
        preserveContractValue,
      }),
    )
    setPendingChange(null)
  }

  function requestPackageChange(packageId: string) {
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

  return (
    <div className={styles.fieldGrid}>
      {pendingChange ? (
        <div className={styles.listItem}>
          <p className={styles.sectionTitle}>
            Zmiana pakietu zastąpi zapisane warunki pakietu.
          </p>
          <p className={styles.muted}>
            Nowy pakiet: {pendingChange.pkg.name} (
            {formatCurrency(pendingChange.pkg.price)})
          </p>
          <div className={styles.rowActions}>
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
              Zastosuj domyślne
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

      <Select
        label="Pakiet katalogowy"
        value={wedding.packageId ?? ''}
        onChange={(e) => requestPackageChange(e.target.value)}
        disabled={catalogPending}
      >
        <option value="">
          {catalogPending ? 'Ładowanie…' : 'Wybierz pakiet…'}
        </option>
        {packageChoices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {formatCurrency(p.price)}
          </option>
        ))}
      </Select>

      <p className={styles.muted}>
        Snapshot: {wedding.packageName || 'brak'} ·{' '}
        {snapshotItems.length} pozycji
      </p>

      <div className={styles.fieldRow}>
        <Input
          label="Wartość umowy"
          type="number"
          min={0}
          value={wedding.price}
          onChange={(e) =>
            onChangeWedding({ price: Number(e.target.value) || 0 })
          }
        />
        <Input
          label="Zaliczka uzgodniona"
          type="number"
          min={0}
          value={wedding.depositAmount ?? 0}
          onChange={(e) =>
            onChangeWedding({ depositAmount: Number(e.target.value) || 0 })
          }
        />
      </div>
      <div className={styles.fieldRow}>
        <Input
          label="Godziny reportażu"
          type="number"
          min={0}
          step="0.5"
          value={wedding.coverageHours ?? ''}
          onChange={(e) =>
            onChangeWedding({
              coverageHours: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
        <Input
          label="Koniec reportażu"
          value={wedding.coverageEndTime ?? ''}
          onChange={(e) =>
            onChangeWedding({
              coverageEndTime: e.target.value.trim() || null,
            })
          }
        />
      </div>
      <div className={styles.fieldRow}>
        <Input
          label="Stawka nadgodzin"
          type="number"
          min={0}
          value={wedding.overtimeRate ?? ''}
          onChange={(e) =>
            onChangeWedding({
              overtimeRate: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
        <Input
          label="Oddanie (miesiące)"
          type="number"
          min={0}
          value={wedding.deliveryMonths ?? ''}
          onChange={(e) =>
            onChangeWedding({
              deliveryMonths: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
        <Input
          label="Oddanie (dni)"
          type="number"
          min={0}
          value={wedding.deliveryDays ?? ''}
          onChange={(e) =>
            onChangeWedding({
              deliveryDays: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </div>

      <div className={styles.fieldRow}>
        <Select
          label="Termin płatności końcowej"
          value={wedding.finalPaymentTerms?.mode ?? ''}
          onChange={(e) => {
            const mode = e.target.value as
              | ''
              | 'wedding_day'
              | 'days_after_wedding'
              | 'months_after_wedding'
              | 'after_delivery'
            if (!mode) {
              onChangeWedding({
                finalPaymentTerms: null,
                finalPaymentDueDate: null,
              })
              return
            }
            const current = wedding.finalPaymentTerms
            const value =
              current &&
              (current.mode === 'days_after_wedding' ||
                current.mode === 'months_after_wedding')
                ? current.value
                : 14
            const terms =
              mode === 'days_after_wedding' || mode === 'months_after_wedding'
                ? { mode, value }
                : { mode }
            const due = resolveFinalPaymentDueDate({
              terms,
              weddingDate: wedding.date,
            })
            onChangeWedding({
              finalPaymentTerms: terms,
              finalPaymentDueDate: due,
            })
          }}
        >
          <option value="">Nie ustawiono</option>
          {FINAL_PAYMENT_TERMS_MODE_OPTIONS.map((opt) => (
            <option key={opt.mode} value={opt.mode}>
              {opt.label}
            </option>
          ))}
        </Select>
        {wedding.finalPaymentTerms?.mode === 'days_after_wedding' ||
        wedding.finalPaymentTerms?.mode === 'months_after_wedding' ? (
          <Input
            label={
              wedding.finalPaymentTerms.mode === 'days_after_wedding'
                ? 'Liczba dni'
                : 'Liczba miesięcy'
            }
            type="number"
            min={1}
            value={wedding.finalPaymentTerms.value}
            onChange={(e) => {
              const value = Math.max(1, Number(e.target.value) || 1)
              const terms = {
                mode: wedding.finalPaymentTerms!.mode,
                value,
              } as const
              onChangeWedding({
                finalPaymentTerms: terms,
                finalPaymentDueDate: resolveFinalPaymentDueDate({
                  terms,
                  weddingDate: wedding.date,
                }),
              })
            }}
          />
        ) : (
          <Input
            label="Termin płatności (data)"
            type="date"
            value={wedding.finalPaymentDueDate ?? ''}
            onChange={(e) =>
              onChangeWedding({
                finalPaymentDueDate: e.target.value.trim() || null,
              })
            }
            disabled={wedding.finalPaymentTerms?.mode === 'after_delivery'}
          />
        )}
      </div>

      {wedding.packageId ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const selected = packageChoices.find(
              (p) => p.id === wedding.packageId,
            )
            if (!selected) return
            if (
              !window.confirm(
                'Uzupełnić brakujące warunki z aktualnego pakietu katalogu?',
              )
            ) {
              return
            }
            const extrasTotal = extras.reduce(
              (sum, e) => sum + e.priceSnapshot * e.quantity,
              0,
            )
            onChangePackageBasePrice(
              Math.max(0, wedding.price - extrasTotal),
            )
            onChangeWedding(
              fillWeddingTermsFromCatalogPackage(wedding, selected, {
                preserveContractValue: true,
                extrasTotal,
              }),
            )
          }}
        >
          Uzupełnij z katalogu
        </Button>
      ) : null}

      <h3 className={styles.sectionTitle}>Usługi dodatkowe</h3>
      {availableExtras.length > 0 ? (
        <Select
          label="Dodaj usługę"
          value=""
          onChange={(e) => {
            const service = catalogExtras.find((s) => s.id === e.target.value)
            if (!service) return
            const next = [
              ...extras,
              {
                id: `temp-${crypto.randomUUID()}`,
                weddingId: wedding.id,
                extraServiceId: service.id,
                name: service.name,
                priceSnapshot: service.price,
                quantity: 1,
                createdAt: new Date().toISOString(),
              },
            ]
            onChangeExtras(next)
            const base =
              packageBasePrice ??
              Math.max(
                0,
                wedding.price -
                  extras.reduce((s, x) => s + x.priceSnapshot * x.quantity, 0),
              )
            onChangeWedding({
              price:
                base +
                next.reduce((sum, x) => sum + x.priceSnapshot * x.quantity, 0),
            })
          }}
        >
          <option value="">Wybierz…</option>
          {availableExtras.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {formatCurrency(s.price)}
            </option>
          ))}
        </Select>
      ) : null}

      {extras.length === 0 ? (
        <p className={styles.muted}>Brak usług dodatkowych.</p>
      ) : (
        <ul className={styles.list}>
          {extras.map((e) => (
            <li key={e.id} className={styles.listItem}>
              <div className={styles.fieldRow}>
                <Input
                  label="Nazwa"
                  value={e.name ?? ''}
                  onChange={(ev) => {
                    const next = extras.map((row) =>
                      row.id === e.id
                        ? { ...row, name: ev.target.value }
                        : row,
                    )
                    onChangeExtras(next)
                  }}
                />
                <Input
                  label="Ilość"
                  type="number"
                  min={1}
                  value={e.quantity}
                  onChange={(ev) => {
                    const quantity = Math.max(1, Number(ev.target.value) || 1)
                    const next = extras.map((row) =>
                      row.id === e.id ? { ...row, quantity } : row,
                    )
                    onChangeExtras(next)
                    const base =
                      packageBasePrice ??
                      Math.max(
                        0,
                        wedding.price -
                          extras.reduce(
                            (s, x) => s + x.priceSnapshot * x.quantity,
                            0,
                          ),
                      )
                    onChangeWedding({
                      price:
                        base +
                        next.reduce(
                          (sum, x) => sum + x.priceSnapshot * x.quantity,
                          0,
                        ),
                    })
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = extras.filter((row) => row.id !== e.id)
                  onChangeExtras(next)
                  const base =
                    packageBasePrice ??
                    Math.max(
                      0,
                      wedding.price -
                        extras.reduce(
                          (s, x) => s + x.priceSnapshot * x.quantity,
                          0,
                        ),
                    )
                  onChangeWedding({
                    price:
                      base +
                      next.reduce(
                        (sum, x) => sum + x.priceSnapshot * x.quantity,
                        0,
                      ),
                  })
                }}
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { packageService } from '@/lib/api/packageService'
import { requiresAgreedDepositConfirmOnPackageDefaults } from '@/lib/finance/hasPaidDepositPayment'
import {
  applyCommercialPackageSnapshot,
  fillWeddingTermsFromCatalogPackage,
  getAgreedDeposit,
} from '@/lib/utils/commercial'
import {
  FINAL_PAYMENT_TERMS_MODE_OPTIONS,
  resolveFinalPaymentDueDate,
} from '@/lib/utils/finalPaymentTerms'
import { formatCurrency } from '@/lib/utils/currency'
import { getDepositPaid } from '@/lib/utils/finance'
import {
  rebaseEffectivePackageBase,
  recomposeContractValueForExtrasEdit,
  sumExtraPriceSnapshots,
} from '@/lib/forms/weddingExtraPricing'
import { resolveWeddingExtraDisplayName } from '@/lib/forms/weddingExtraName'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import {
  applyDeliveryTermFormToWedding,
  readDeliveryTermForm,
  reconcileDeliveryDeadline,
  type DeliveryTermUnit,
} from '@/lib/utils/weddingDeliveryDeadline'
import type { StudioPackage, WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

type PendingPackageChange = {
  pkg: StudioPackage
  extrasTotal: number
  /** After choosing apply-defaults when paid deposit conflicts. */
  depositDecision?: 'choose' | 'keep' | 'use-catalog'
}

/** Shared package edit fields — no V1 Card / hero wrappers. */
export function PackageFields({
  wedding,
  extras,
  payments = [],
  packageBasePrice,
  onChangeWedding,
  onChangeExtras,
  onChangePackageBasePrice,
}: {
  wedding: Wedding
  extras: WeddingExtraService[]
  payments?: Payment[]
  packageBasePrice?: number
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangeExtras: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice: (price: number) => void
}) {
  const userId = useStudioAuthId()
  const [pendingChange, setPendingChange] = useState<PendingPackageChange | null>(
    null,
  )

  function extrasTotalOf(list: WeddingExtraService[]) {
    return sumExtraPriceSnapshots(
      list.map((e) => ({
        priceSnapshot: e.priceSnapshot,
        quantity: e.quantity,
      })),
    )
  }

  function applyManualContractValue(enteredCv: number) {
    const travel = getEffectiveTravelFeeAmount(wedding)
    const extrasTotal = extrasTotalOf(extras)
    onChangeWedding({ price: enteredCv })
    onChangePackageBasePrice(
      rebaseEffectivePackageBase({
        contractValue: enteredCv,
        extrasTotal,
        effectiveTravel: travel,
      }),
    )
  }

  function applyExtrasSelection(next: WeddingExtraService[]) {
    onChangeExtras(next)
    const travel = getEffectiveTravelFeeAmount(wedding)
    onChangeWedding({
      price: recomposeContractValueForExtrasEdit({
        currentWeddingPrice: wedding.price,
        extrasBefore: extras,
        extrasAfter: next,
        effectiveTravelFee: travel,
        packageBasePrice,
      }),
    })
  }

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
  const linkedPackageAvailable =
    !wedding.packageId ||
    packageChoices.some((p) => p.id === wedding.packageId)
  const missingCatalogPackage =
    Boolean(wedding.packageId) && !catalogPending && !linkedPackageAvailable
  const selectValue = missingCatalogPackage ? '' : (wedding.packageId ?? '')

  function commitPackageChange(
    pkg: StudioPackage,
    extrasTotal: number,
    preserveFinancialAgreement: boolean,
    preserveDepositOverride?: boolean,
  ) {
    const travel = getEffectiveTravelFeeAmount(wedding)
    const preserveDeposit = preserveFinancialAgreement
      ? true
      : preserveDepositOverride === true
    onChangePackageBasePrice(
      preserveFinancialAgreement
        ? rebaseEffectivePackageBase({
            contractValue: wedding.price,
            extrasTotal,
            effectiveTravel: travel,
          })
        : pkg.price,
    )
    const commercial = applyCommercialPackageSnapshot(wedding, pkg, {
      extrasTotal,
      effectiveTravelFee: travel,
      preserveContractValue: preserveFinancialAgreement,
      preserveDeposit,
    })
    onChangeWedding({
      ...commercial,
      ...reconcileDeliveryDeadline({
        previous: wedding,
        next: { ...wedding, ...commercial },
      }),
    })
    setPendingChange(null)
  }

  function requestApplyDefaults(pkg: StudioPackage, extrasTotal: number) {
    if (
      requiresAgreedDepositConfirmOnPackageDefaults({
        payments,
        currentAgreedDeposit: getAgreedDeposit(wedding),
        catalogDefaultDeposit: Math.max(0, pkg.depositAmount ?? 0),
      })
    ) {
      setPendingChange({
        pkg,
        extrasTotal,
        depositDecision: 'choose',
      })
      return
    }
    commitPackageChange(pkg, extrasTotal, false, false)
  }

  function requestPackageChange(packageId: string) {
    const selected = packageChoices.find((p) => p.id === packageId)
    if (!selected) return
    const extrasTotal = extrasTotalOf(extras)
    const hasExisting =
      Boolean(wedding.packageId) ||
      Boolean(wedding.packageName) ||
      (wedding.packageItems?.length ?? 0) > 0
    if (hasExisting && wedding.packageId !== selected.id) {
      setPendingChange({ pkg: selected, extrasTotal })
      return
    }
    commitPackageChange(selected, extrasTotal, false, false)
  }

  const showingDepositDecision = pendingChange?.depositDecision === 'choose'

  return (
    <div className={styles.fieldGrid}>
      {pendingChange && showingDepositDecision ? (
        <div className={styles.listItem} data-testid="package-deposit-decision">
          <p className={styles.sectionTitle}>Zmiana zaliczki</p>
          <p className={styles.muted}>
            Obecna zaliczka uzgodniona:{' '}
            <strong>{formatCurrency(getAgreedDeposit(wedding))}</strong>
          </p>
          <p className={styles.muted}>
            Domyślna zaliczka nowego pakietu:{' '}
            <strong>
              {formatCurrency(Math.max(0, pendingChange.pkg.depositAmount ?? 0))}
            </strong>
          </p>
          <p className={styles.muted}>
            Już opłacona zaliczka:{' '}
            <strong>{formatCurrency(getDepositPaid(payments))}</strong>
          </p>
          <p className={styles.muted}>
            Zmiana zaliczki uzgodnionej nie zmienia zapisanej wpłaty.
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
                  true,
                )
              }
            >
              Zachowaj zaliczkę {formatCurrency(getAgreedDeposit(wedding))}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                commitPackageChange(
                  pendingChange.pkg,
                  pendingChange.extrasTotal,
                  false,
                  false,
                )
              }
            >
              Zmień zaliczkę na{' '}
              {formatCurrency(Math.max(0, pendingChange.pkg.depositAmount ?? 0))}
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

      {pendingChange && !showingDepositDecision ? (
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
                requestApplyDefaults(
                  pendingChange.pkg,
                  pendingChange.extrasTotal,
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
        value={selectValue}
        onChange={(e) => requestPackageChange(e.target.value)}
        disabled={catalogPending || Boolean(pendingChange)}
        data-testid="package-catalog-select"
      >
        <option value="">
          {catalogPending
            ? 'Ładowanie…'
            : missingCatalogPackage
              ? 'Wybierz dostępny pakiet…'
              : 'Wybierz pakiet…'}
        </option>
        {packageChoices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {formatCurrency(p.price)}
          </option>
        ))}
      </Select>

      {missingCatalogPackage ? (
        <p className={styles.muted} data-testid="package-catalog-missing">
          Powiązany pakiet katalogowy jest niedostępny (usunięty lub nieaktywny).
          Snapshot „{wedding.packageName || 'bez nazwy'}” pozostaje bez zmian —
          wybierz pakiet, aby ponownie powiązać katalog.
        </p>
      ) : null}

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
            applyManualContractValue(Number(e.target.value) || 0)
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
              coverageHours:
                e.target.value === '' ? null : Number(e.target.value) || 0,
            })
          }
        />
        <Input
          label="Koniec reportażu"
          type="time"
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
      </div>
      <div className={styles.fieldRow} data-testid="wedding-delivery-term">
        <Input
          label="Termin oddania"
          type="number"
          min={1}
          step={1}
          value={
            readDeliveryTermForm(wedding.deliveryMonths, wedding.deliveryDays)
              .value
          }
          onChange={(e) => {
            const unit = readDeliveryTermForm(
              wedding.deliveryMonths,
              wedding.deliveryDays,
            ).unit
            onChangeWedding(
              applyDeliveryTermFormToWedding(wedding, unit, e.target.value),
            )
          }}
          data-testid="wedding-delivery-term-value"
        />
        <Select
          label="Jednostka"
          value={
            readDeliveryTermForm(wedding.deliveryMonths, wedding.deliveryDays)
              .unit
          }
          onChange={(e) => {
            const unit = e.target.value as DeliveryTermUnit
            const value = readDeliveryTermForm(
              wedding.deliveryMonths,
              wedding.deliveryDays,
            ).value
            onChangeWedding(
              applyDeliveryTermFormToWedding(wedding, unit, value),
            )
          }}
          data-testid="wedding-delivery-term-unit"
        >
          <option value="months">miesięcy</option>
          <option value="calendar_days">dni kalendarzowych</option>
        </Select>
      </div>

      {/*
        finalPaymentTerms = rule/mode; finalPaymentDueDate = derived concrete date.
        Show one coherent control: mode (+ numeric value when needed).
        Hide duplicate date when mode already defines the deadline.
        Legacy: date-only (no mode) keeps a single date field.
      */}
      <div className={styles.deadlineBlock} data-testid="final-payment-deadline">
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
                finalPaymentDueDate: wedding.finalPaymentDueDate ?? null,
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
        ) : null}
        {!wedding.finalPaymentTerms?.mode ? (
          <Input
            label="Termin płatności (data)"
            type="date"
            value={wedding.finalPaymentDueDate ?? ''}
            onChange={(e) =>
              onChangeWedding({
                finalPaymentDueDate: e.target.value.trim() || null,
              })
            }
            hint="Opcjonalnie, gdy nie wybrano reguły powyżej."
          />
        ) : null}
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
                'Uzupełnić brakujące warunki z aktualnego pakietu katalogu? Wartość umowy, zaliczka, usługi dodatkowe i dojazd pozostaną bez zmian.',
              )
            ) {
              return
            }
            const extrasTotal = extrasTotalOf(extras)
            const travel = getEffectiveTravelFeeAmount(wedding)
            const filled = fillWeddingTermsFromCatalogPackage(wedding, selected, {
              preserveContractValue: true,
              preserveDeposit: true,
              extrasTotal,
              effectiveTravelFee: travel,
            })
            onChangePackageBasePrice(
              rebaseEffectivePackageBase({
                contractValue: wedding.price,
                extrasTotal,
                effectiveTravel: travel,
              }),
            )
            onChangeWedding({
              ...filled,
              ...reconcileDeliveryDeadline({
                previous: wedding,
                next: { ...wedding, ...filled },
              }),
            })
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
            applyExtrasSelection([
              ...extras,
              {
                id: `temp-${createBrowserSafeId()}`,
                weddingId: wedding.id,
                extraServiceId: service.id,
                name: service.name,
                nameSnapshot: service.name,
                priceSnapshot: service.price,
                quantity: 1,
                createdAt: new Date().toISOString(),
              },
            ])
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
                <div>
                  <span className={styles.extraNameLabel}>Usługa</span>
                  <p className={styles.extraName}>
                    {resolveWeddingExtraDisplayName(e)}
                  </p>
                </div>
                <Input
                  label="Ilość"
                  type="number"
                  min={1}
                  value={e.quantity}
                  onChange={(ev) => {
                    const quantity = Math.max(1, Number(ev.target.value) || 1)
                    applyExtrasSelection(
                      extras.map((row) =>
                        row.id === e.id ? { ...row, quantity } : row,
                      ),
                    )
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  applyExtrasSelection(extras.filter((row) => row.id !== e.id))
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

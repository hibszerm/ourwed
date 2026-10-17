import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { rebaseEffectivePackageBase, sumExtraPriceSnapshots } from '@/lib/forms/weddingExtraPricing'
import { createBrowserSafeId } from '@/lib/utils/createBrowserSafeId'
import { paymentService } from '@/lib/api/paymentService'
import { useAuth } from '@/features/auth/AuthProvider'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, PaymentType, Wedding } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

const PAYMENT_TYPES: PaymentType[] = ['deposit', 'installment', 'final', 'other']

const TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Zadatek',
  installment: 'Wpłata',
  final: 'Płatność końcowa',
  other: 'Inne',
}

/** Shared finance edit fields — no V1 Card wrappers. */
export function FinanceFields({
  wedding,
  payments,
  extras = [],
  onChangeWedding,
  onChangePayments,
  onChangePackageBasePrice,
}: {
  wedding: Wedding
  payments: Payment[]
  extras?: WeddingExtraService[]
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangePayments: (payments: Payment[]) => void
  onChangePackageBasePrice?: (price: number) => void
}) {
  const { user } = useAuth()
  const receiverQuery = useQuery({
    queryKey: ['wedding-payment-receivers-v3', user?.id, wedding.id],
    queryFn: () => paymentService.listReceivers(wedding.id),
    staleTime: 0,
  })
  function applyManualContractValue(enteredCv: number) {
    onChangeWedding({ price: enteredCv })
    onChangePackageBasePrice?.(
      rebaseEffectivePackageBase({
        contractValue: enteredCv,
        extrasTotal: sumExtraPriceSnapshots(
          extras.map((e) => ({
            priceSnapshot: e.priceSnapshot,
            quantity: e.quantity,
          })),
        ),
        effectiveTravel: getEffectiveTravelFeeAmount(wedding),
      }),
    )
  }

  function updatePayment(id: string, patch: Partial<Payment>) {
    onChangePayments(
      payments.map((p) => {
        if (p.id !== id) return p
        const next = { ...p, ...patch }
        if (patch.paid === true && !next.paidAt) {
          next.paidAt = new Date().toISOString().slice(0, 10)
        }
        if (patch.paid === false) next.paidAt = undefined
        if (patch.paid === false) {
          next.receivedByUserId = undefined
          next.receiverRelationshipId = undefined
          next.receiverKind = undefined
          next.receiverLabel = undefined
        }
        if (patch.paid === true && !next.receivedByUserId) {
          const owner = receiverQuery.data?.find((option) => option.kind === 'owner')
          if (owner) {
            next.receivedByUserId = owner.userId
            next.receiverKind = 'owner'
            next.receiverLabel = owner.label
          }
        }
        if (patch.type) next.label = TYPE_LABELS[patch.type]
        return next
      }),
    )
  }

  return (
    <div className={styles.fieldGrid}>
      <section className={styles.editGroup} aria-labelledby="fin-group-agreement">
        <h3 id="fin-group-agreement" className={styles.editGroupTitle}>
          Umowa handlowa
        </h3>
        <div className={styles.fieldRow}>
          <Input
            label="Wartość umowy"
            type="number"
            min={0}
            value={Number.isFinite(wedding.price) ? wedding.price : 0}
            onChange={(e) =>
              applyManualContractValue(Number(e.target.value) || 0)
            }
          />
          <Input
            label="Zadatek uzgodniony"
            type="number"
            min={0}
            value={wedding.depositAmount ?? ''}
            onChange={(e) =>
              onChangeWedding({
                depositAmount:
                  e.target.value === ''
                    ? undefined
                    : Number(e.target.value) || 0,
              })
            }
          />
        </div>
        <Input
          label="Termin płatności końcowej"
          type="date"
          value={wedding.finalPaymentDueDate ?? ''}
          onChange={(e) =>
            onChangeWedding({
              finalPaymentDueDate: e.target.value || undefined,
            })
          }
        />
      </section>

      <section className={styles.editGroup} aria-labelledby="fin-group-payments">
        <div className={styles.rowActions}>
          <h3 id="fin-group-payments" className={styles.editGroupTitle}>
            Wpłaty
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChangePayments([
                ...payments,
                {
                  id: `temp-${createBrowserSafeId()}`,
                  label: TYPE_LABELS.installment,
                  amount: 0,
                  type: 'installment',
                  paid: false,
                },
              ])
            }
          >
            Dodaj wpłatę
          </Button>
        </div>

        {payments.length === 0 ? (
          <p className={styles.muted}>Brak wpłat.</p>
        ) : (
          <ul className={styles.list}>
            {payments.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <div className={styles.fieldRow}>
                  <Select
                    label="Typ"
                    value={p.type}
                    onChange={(e) =>
                      updatePayment(p.id, {
                        type: e.target.value as PaymentType,
                      })
                    }
                  >
                    {PAYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Kwota"
                    type="number"
                    min={0}
                    value={p.amount}
                    onChange={(e) =>
                      updatePayment(p.id, {
                        amount: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <label className={styles.muted}>
                  <input
                    type="checkbox"
                    checked={p.paid}
                    onChange={(e) =>
                      updatePayment(p.id, { paid: e.target.checked })
                    }
                  />{' '}
                  Opłacone
                </label>
                {p.paid ? (
                  <Select
                    label="Otrzymał"
                    value={p.receiverRelationshipId
                      ? `collaborator:${p.receiverRelationshipId}`
                      : p.receivedByUserId ? `owner:${p.receivedByUserId}` : ''}
                    disabled={receiverQuery.isPending || receiverQuery.isError}
                    onChange={(e) => {
                      const selected = receiverQuery.data?.find((option) => option.kind === 'owner'
                        ? e.target.value === `owner:${option.userId}`
                        : e.target.value === `collaborator:${option.relationshipId}`)
                      if (selected) updatePayment(p.id, {
                        receivedByUserId: selected.userId,
                        receiverRelationshipId: selected.relationshipId ?? undefined,
                        receiverKind: selected.kind,
                        receiverLabel: selected.label,
                      })
                    }}
                  >
                    <option value="">Wybierz osobę</option>
                    {p.receivedByUserId && !(receiverQuery.data ?? []).some((option) => option.userId === p.receivedByUserId && option.relationshipId === (p.receiverRelationshipId ?? null)) ? (
                      <option value={p.receiverRelationshipId ? `collaborator:${p.receiverRelationshipId}` : `owner:${p.receivedByUserId}`}>
                        {p.receiverLabel ?? 'Historyczny odbiorca'}
                      </option>
                    ) : null}
                    {(receiverQuery.data ?? []).map((option) => (
                      <option key={option.relationshipId ?? option.userId}
                        value={option.kind === 'owner' ? `owner:${option.userId}` : `collaborator:${option.relationshipId}`}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChangePayments(payments.filter((row) => row.id !== p.id))
                  }
                >
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { WeddingContractsModule } from '@/features/weddings/components/detail/WeddingContractsModule'
import { WeddingSourceContractsPanel } from '@/features/wedding-contract-recovery/components/WeddingSourceContractsPanel'
import { WeddingContractQuestionnaireSection } from '@/features/weddings/detail/v2/WeddingContractQuestionnaireSection'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import { getPackageSummary } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import { paymentService } from '@/lib/api/paymentService'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTravelFeeDisplay } from '@/lib/utils/travelFeeCommercial'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  payments: Payment[]
  extras: WeddingExtraService[]
  onAction: (action: WeddingHeroAction) => void
  forcePackageOpen?: boolean
  onEditPackage?: () => void
  onEditFinances?: () => void
  onEditPayment?: (payment: Payment) => void
  onContractStatusChanged?: () => void
  onWeddingUpdated?: (wedding: Wedding) => void
}

function deletePaymentCopy(payment: Payment): { title: string; body: string } {
  if (payment.type === 'deposit') {
    return {
      title: 'Usunąć zadatek?',
      body: 'Ta operacja usunie wpis zadatku i ponownie przeliczy kwotę wpłaconą oraz pozostałą do zapłaty. Ustalona kwota zadatku w umowie pozostanie bez zmian.',
    }
  }
  return {
    title: 'Usunąć wpłatę?',
    body: 'Ta operacja usunie wpis płatności i ponownie przeliczy kwotę wpłaconą oraz pozostałą do zapłaty.',
  }
}

/**
 * Commercial contract + finance surface — no persistent readiness checklist.
 * Generation validates missing data on demand via Generuj umowę.
 * Editing opens the V2 drawer (page-owned), not inline V1 cards.
 */
export function WeddingContractFinanceWorkspace({
  wedding,
  payments,
  extras,
  onAction,
  forcePackageOpen,
  onEditPackage,
  onEditFinances,
  onEditPayment,
  onContractStatusChanged,
  onWeddingUpdated,
}: Props) {
  const invalidate = useInvalidateWedding()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const [contentsOpen, setContentsOpen] = useState(Boolean(forcePackageOpen))
  const [travelFeeOpen, setTravelFeeOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pkg = getPackageSummary(wedding)
  const travelLabel = formatTravelFeeDisplay(wedding, formatCurrency)
  const travelUnresolved =
    (wedding.travelFeeStatus ?? 'unresolved') === 'unresolved'
  const contractLifecycleDescription =
    wedding.contract.status === 'none'
      ? 'Umowa nie została jeszcze wygenerowana'
      : 'Zapisane umowy dla tego ślubu'
  const deleteCopy = pendingDelete ? deletePaymentCopy(pendingDelete) : null

  async function confirmDeletePayment() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await paymentService.delete(pendingDelete.id)
      await invalidate(wedding.id)
      showToast(
        pendingDelete.type === 'deposit'
          ? 'Zadatek został usunięty'
          : 'Wpłata została usunięta',
        'success',
      )
      setPendingDelete(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć wpłaty',
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={styles.contractWorkspace}
      data-testid="wedding-contract-finance"
    >
      <section
        className={styles.surfaceSection}
        aria-label={contractLifecycleDescription}
        data-testid="contract-finance-contracts"
      >
        <WeddingContractsModule
          wedding={wedding}
          onGenerate={() => onAction('generate_contract')}
          onContractStatusChanged={onContractStatusChanged}
        />
        <WeddingSourceContractsPanel weddingId={wedding.id} />
      </section>

      <WeddingContractQuestionnaireSection wedding={wedding} />

      <section
        className={styles.surfaceSection}
        aria-labelledby="finance-title"
        data-testid="contract-finance-finance"
      >
        <div className={styles.surfaceHeader}>
          <h2 id="finance-title" className={styles.sectionHeading}>
            Finanse
          </h2>
          {onEditFinances ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditFinances}
            >
              Edytuj finanse
            </Button>
          ) : null}
        </div>
        <div className={styles.paymentSummary}>
          <div>
            <p className={styles.paymentBig}>{pkg.contractValueLabel}</p>
            <p className={styles.bandLabel}>Wartość umowy</p>
          </div>
          <div>
            <p className={styles.paymentBig}>{formatCurrency(pkg.totalPaid)}</p>
            <p className={styles.bandLabel}>Wpłacono</p>
          </div>
          <div>
            <p className={styles.paymentBig}>
              {formatCurrency(pkg.remainingToPay)}
            </p>
            <p className={styles.bandLabel}>Pozostało</p>
          </div>
        </div>
        <div className={styles.surfaceHeader} data-testid="travel-fee-summary">
          <div>
            <p className={styles.bandLabel}>Koszt dojazdu</p>
            <p className={styles.paymentBig}>{travelLabel}</p>
          </div>
          <Button
            type="button"
            variant={travelUnresolved ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTravelFeeOpen(true)}
            data-testid="travel-fee-resolve-open"
          >
            {travelUnresolved ? 'Ustal' : 'Edytuj'}
          </Button>
        </div>
        <p className={styles.contextMuted}>
          Termin płatności końcowej: {pkg.finalPaymentDueLabel}
        </p>

        <div className={styles.financePaymentsBlock}>
          <h3 id="pay-title" className={styles.sectionHeading}>
            Płatności
          </h3>
          <div className={styles.contextActions}>
            {hasPaidDepositPayment(payments) ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="finance-add-payment"
                onClick={() => onAction('add_payment')}
              >
                Dodaj wpłatę
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="finance-add-deposit"
                onClick={() => onAction('add_deposit')}
              >
                Dodaj zadatek
              </Button>
            )}
          </div>
          {payments.length === 0 ? (
            <p className={styles.contextMuted}>Brak wpłat.</p>
          ) : (
            <ul className={styles.paymentList}>
              {payments.map((p) => (
                <li key={p.id} className={styles.paymentItem}>
                  <div className={styles.paymentMain}>
                    <span className={styles.paymentLabel}>
                      {p.label} · {formatCurrency(p.amount)}
                    </span>
                    <span className={styles.contextMuted}>
                      {p.paid ? 'Opłacone' : 'Oczekuje'}
                    </span>
                  </div>
                  <div className={styles.paymentActions}>
                    {onEditPayment ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-testid="finance-edit-payment"
                        onClick={() => onEditPayment(p)}
                      >
                        Edytuj
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="finance-delete-payment"
                      disabled={deleting && pendingDelete?.id === p.id}
                      onClick={() => requirePro(() => setPendingDelete(p))}
                    >
                      Usuń
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className={styles.surfaceSection}
        aria-labelledby="package-title"
        id="package-details-anchor"
        data-testid="contract-finance-package"
      >
        <div className={styles.surfaceHeader}>
          <h2 id="package-title" className={styles.sectionHeading}>
            Pakiet i usługi
          </h2>
          {onEditPackage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditPackage}
            >
              Edytuj pakiet
            </Button>
          ) : null}
        </div>
        <dl className={styles.editorialKv}>
          <div>
            <dt>Pakiet</dt>
            <dd>{pkg.name}</dd>
          </div>
          <div>
            <dt>Wartość umowy</dt>
            <dd>{pkg.contractValueLabel}</dd>
          </div>
          <div>
            <dt>Koszt dojazdu</dt>
            <dd>{travelLabel}</dd>
          </div>
          <div>
            <dt>Zaliczka</dt>
            <dd>{pkg.agreedDepositLabel}</dd>
          </div>
          <div>
            <dt>Reportaż</dt>
            <dd>{pkg.coverageLabel}</dd>
          </div>
          <div>
            <dt>Nadgodzina</dt>
            <dd>{pkg.overtimeLabel}</dd>
          </div>
          <div>
            <dt>Termin oddania</dt>
            <dd>{pkg.deliveryLabel}</dd>
          </div>
          <div>
            <dt>Termin płatności końcowej</dt>
            <dd>{pkg.finalPaymentDueLabel}</dd>
          </div>
          <div>
            <dt>Usługi dodatkowe</dt>
            <dd>
              {extras.length === 0
                ? 'Brak'
                : extras
                    .map(
                      (e) =>
                        `${e.name?.trim() || 'Usługa'}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`,
                    )
                    .join(', ')}
            </dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={contentsOpen}
          onClick={() => setContentsOpen((v) => !v)}
        >
          {contentsOpen ? 'Ukryj zawartość pakietu' : 'Pokaż zawartość pakietu'}
        </Button>
        {contentsOpen ? (
          <ul className={styles.packageContents}>
            {pkg.items.length === 0 ? (
              <li className={styles.contextMuted}>
                Brak pozycji w snapshotcie.
              </li>
            ) : (
              pkg.items.map((item, i) => (
                <li key={item.sourceItemId ?? `${item.title}-${i}`}>
                  {item.title}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>

      <TravelFeeResolveModal
        open={travelFeeOpen}
        wedding={wedding}
        extras={extras}
        onClose={() => setTravelFeeOpen(false)}
        onSaved={(updated) => onWeddingUpdated?.(updated)}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        title={deleteCopy?.title ?? 'Usunąć wpłatę?'}
        description={deleteCopy?.body}
        busy={deleting}
        cancelLabel="Anuluj"
        primaryAction={
          <Button
            type="button"
            variant="danger"
            disabled={deleting}
            data-testid="finance-delete-payment-confirm"
            onClick={() => void confirmDeletePayment()}
          >
            {deleting ? 'Usuwanie…' : 'Usuń'}
          </Button>
        }
      >
        {pendingDelete ? (
          <p className={styles.contextMuted} style={{ margin: 0 }}>
            {pendingDelete.label} · {formatCurrency(pendingDelete.amount)}
          </p>
        ) : null}
      </Modal>
    </div>
  )
}

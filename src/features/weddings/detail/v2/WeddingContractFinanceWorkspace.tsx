import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { WeddingContractsModule } from '@/features/weddings/components/detail/WeddingContractsModule'
import { WeddingSourceContractsPanel } from '@/features/wedding-contract-recovery/components/WeddingSourceContractsPanel'
import { WeddingContractQuestionnaireSection } from '@/features/weddings/detail/v2/WeddingContractQuestionnaireSection'
import { getPackageSummary } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import { formatCurrency } from '@/lib/utils/currency'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  payments: Payment[]
  extras: WeddingExtraService[]
  onAction: (action: WeddingHeroAction) => void
  forcePackageOpen?: boolean
  onEditPackage?: () => void
  onEditFinances?: () => void
  onContractStatusChanged?: () => void
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
  onContractStatusChanged,
}: Props) {
  const [contentsOpen, setContentsOpen] = useState(Boolean(forcePackageOpen))
  const pkg = getPackageSummary(wedding)
  const contractLifecycleDescription =
    wedding.contract.status === 'none'
      ? 'Umowa nie została jeszcze wygenerowana'
      : 'Zapisane umowy dla tego ślubu'

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
        <p className={styles.contextMuted}>
          Termin płatności końcowej: {pkg.finalPaymentDueLabel}
        </p>

        <div className={styles.financePaymentsBlock}>
          <h3 id="pay-title" className={styles.sectionHeading}>
            Płatności
          </h3>
          <div className={styles.contextActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="finance-add-payment"
              onClick={() => onAction('add_payment')}
            >
              Dodaj wpłatę
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="finance-add-deposit"
              onClick={() => onAction('add_deposit')}
            >
              Dodaj zadatek
            </Button>
          </div>
          {payments.length === 0 ? (
            <p className={styles.contextMuted}>Brak wpłat.</p>
          ) : (
            <ul className={styles.paymentList}>
              {payments.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.label} · {formatCurrency(p.amount)}
                  </span>
                  <span className={styles.contextMuted}>
                    {p.paid ? 'Opłacone' : 'Oczekuje'}
                  </span>
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
    </div>
  )
}

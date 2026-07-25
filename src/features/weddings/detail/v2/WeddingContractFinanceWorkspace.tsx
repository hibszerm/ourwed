import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { getPackageSummary } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingExtraService } from '@/types/package'
import type { ContractStatus, Payment, Wedding } from '@/types/wedding'
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
}

function contractLifecycleLabel(status: ContractStatus): string {
  switch (status) {
    case 'generated':
      return 'Wersja robocza'
    case 'sent':
      return 'Wysłana'
    case 'signed':
      return 'Podpisana'
    case 'none':
    default:
      return 'Umowa nie została jeszcze wygenerowana'
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
}: Props) {
  const [contentsOpen, setContentsOpen] = useState(Boolean(forcePackageOpen))
  const pkg = getPackageSummary(wedding)

  return (
    <div
      className={styles.contractWorkspace}
      data-testid="wedding-contract-finance"
    >
      <section className={styles.surfaceSection} aria-labelledby="contract-title">
        <div className={styles.surfaceHeader}>
          <div>
            <h2 id="contract-title" className={styles.sectionHeading}>
              Umowa
            </h2>
            <p className={styles.contextMuted}>
              {contractLifecycleLabel(wedding.contract.status)}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onAction('generate_contract')}
          >
            Generuj umowę
          </Button>
        </div>
      </section>

      <section
        className={styles.surfaceSection}
        aria-labelledby="package-title"
        id="package-details-anchor"
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

      <section className={styles.surfaceSection} aria-labelledby="finance-title">
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
      </section>

      <section className={styles.surfaceSection} aria-labelledby="pay-title">
        <h2 id="pay-title" className={styles.sectionHeading}>
          Płatności
        </h2>
        <div className={styles.contextActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAction('add_payment')}
          >
            Dodaj wpłatę
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
      </section>
    </div>
  )
}

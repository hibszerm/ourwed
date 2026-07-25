import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { WeddingDetailFinances } from '@/features/weddings/components/detail/WeddingDetailFinances'
import { WeddingDetailPackage } from '@/features/weddings/components/detail/WeddingDetailPackage'
import {
  getPackageSummary,
  getReadinessGroups,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'
import type { WeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import type { WeddingHeroAction } from '@/features/weddings/components/detail/WeddingDetailHero'
import { formatCurrency } from '@/lib/utils/currency'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  readiness: WeddingContractReadiness
  payments: Payment[]
  extras: WeddingExtraService[]
  editing: boolean
  packageBasePrice?: number
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangePayments: (payments: Payment[]) => void
  onChangeExtras: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice: (price: number) => void
  onAction: (action: WeddingHeroAction) => void
  forcePackageOpen?: boolean
}

export function WeddingContractFinanceWorkspace({
  wedding,
  readiness,
  payments,
  extras,
  editing,
  packageBasePrice,
  onChangeWedding,
  onChangePayments,
  onChangeExtras,
  onChangePackageBasePrice,
  onAction,
  forcePackageOpen,
}: Props) {
  const groups = getReadinessGroups(readiness)
  const [userOpen, setUserOpen] = useState<Partial<Record<string, boolean>>>({})
  const [contentsOpen, setContentsOpen] = useState(Boolean(forcePackageOpen))
  const pkg = getPackageSummary(wedding)
  const completeRequired =
    readiness.requiredTotal - readiness.requiredMissing
  const progress =
    readiness.requiredTotal > 0
      ? Math.round((completeRequired / readiness.requiredTotal) * 100)
      : 0

  if (editing) {
    return (
      <div className={styles.contractWorkspace} data-testid="wedding-contract-finance">
        <WeddingDetailPackage
          wedding={wedding}
          editing
          extras={extras}
          packageBasePrice={packageBasePrice}
          onChangeWedding={onChangeWedding}
          onChangeExtras={onChangeExtras}
          onChangePackageBasePrice={onChangePackageBasePrice}
        />
        <WeddingDetailFinances
          wedding={wedding}
          contractPrice={wedding.price}
          payments={payments}
          editing
          onChangeWedding={onChangeWedding}
          onChangePayments={onChangePayments}
        />
      </div>
    )
  }

  return (
    <div
      className={styles.contractWorkspace}
      data-testid="wedding-contract-finance"
    >
      <section className={styles.surfaceSection} aria-labelledby="ready-title">
        <div className={styles.surfaceHeader}>
          <div>
            <h2 id="ready-title" className={styles.sectionHeading}>
              Gotowość umowy
            </h2>
            <p className={styles.contextMuted}>
              {completeRequired} / {readiness.requiredTotal}
            </p>
          </div>
          <span
            className={styles.statusPill}
            data-ready={readiness.overall === 'ready'}
          >
            {readiness.overall === 'ready' ? 'Gotowe' : 'Wymaga uzupełnienia'}
          </span>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.readinessGroups}>
          {groups.map((g) => {
            const expanded = userOpen[g.group] ?? g.missing > 0
            return (
              <div key={g.group} className={styles.readinessGroup}>
                <button
                  type="button"
                  className={styles.readinessGroupHeader}
                  aria-expanded={expanded}
                  onClick={() =>
                    setUserOpen((prev) => ({ ...prev, [g.group]: !expanded }))
                  }
                >
                  <span className={styles.contextStrong}>{g.label}</span>
                  <span className={styles.contextMuted}>
                    {g.complete} / {g.total}
                    {g.missing > 0
                      ? ` · Brakuje ${g.missing}`
                      : ' · Kompletne'}
                  </span>
                </button>
                {expanded ? (
                  <ul className={styles.readinessList}>
                    {g.group === 'company' && readiness.overall !== 'ready' ? (
                      <li className={styles.readinessHint}>
                        <Link to="/ustawienia/firma">Ustawienia → Firma</Link>
                      </li>
                    ) : null}
                    {g.items.map((item) => (
                      <li
                        key={item.id}
                        className={styles.readinessItem}
                        data-status={item.status}
                      >
                        <span aria-hidden>
                          {item.status === 'complete'
                            ? '✓'
                            : item.status === 'missing'
                              ? '!'
                              : '○'}
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.surfaceSection} aria-labelledby="commercial-title">
        <h2 id="commercial-title" className={styles.sectionHeading}>
          Umowa handlowa
        </h2>
        <dl className={styles.editorialKv} id="package-details-anchor">
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
            <dt>Płatność końcowa</dt>
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
              <li className={styles.contextMuted}>Brak pozycji w snapshotcie.</li>
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

      <section className={styles.surfaceSection} aria-labelledby="pay-title">
        <h2 id="pay-title" className={styles.sectionHeading}>
          Płatności
        </h2>
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

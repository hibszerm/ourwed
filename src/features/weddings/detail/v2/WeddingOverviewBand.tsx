import type { DeliveryDeadlineState } from '@/lib/utils/weddingDeliveryDeadline'
import styles from './WeddingDetailV2.module.css'

interface OverviewBandProps {
  contractValueLabel: string
  totalPaidLabel: string
  remainingLabel: string
  finalDueLabel: string
  deliveryDueLabel: string
  deliveryContextLabel: string | null
  deliveryState: DeliveryDeadlineState
  onOpenDelivery?: () => void
}

/** Compact commercial summary — value / paid / remaining / payment due / delivery due. */
export function WeddingOverviewBand(props: OverviewBandProps) {
  return (
    <section
      className={styles.overviewBand}
      aria-label="Podsumowanie zlecenia"
      data-testid="wedding-overview-band"
    >
      <div className={styles.bandItem}>
        <span className={styles.bandLabel}>Wartość umowy</span>
        <span className={styles.bandValue}>{props.contractValueLabel}</span>
      </div>
      <div className={styles.bandItem}>
        <span className={styles.bandLabel}>Wpłacono</span>
        <span className={styles.bandValue}>{props.totalPaidLabel}</span>
      </div>
      <div className={styles.bandItem}>
        <span className={styles.bandLabel}>Pozostało</span>
        <span className={styles.bandValue}>{props.remainingLabel}</span>
      </div>
      <div className={styles.bandItem}>
        <span className={styles.bandLabel}>Termin płatności</span>
        <span className={styles.bandValue}>{props.finalDueLabel}</span>
      </div>
      <div className={styles.bandItem}>
        <button
          type="button"
          className={styles.bandAction}
          onClick={props.onOpenDelivery}
          aria-label="Termin oddania — otwórz"
          data-testid="wedding-delivery-due-cell"
        >
          <span className={styles.bandLabel}>Termin oddania</span>
          <span className={styles.bandValue}>{props.deliveryDueLabel}</span>
          {props.deliveryContextLabel ? (
            <span
              className={styles.bandHint}
              data-state={props.deliveryState}
            >
              {props.deliveryContextLabel}
            </span>
          ) : null}
        </button>
      </div>
    </section>
  )
}

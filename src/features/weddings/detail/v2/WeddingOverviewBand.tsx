import styles from './WeddingDetailV2.module.css'

interface OverviewBandProps {
  stageLabel: string
  contractValueLabel: string
  totalPaidLabel: string
  remainingLabel: string
  finalDueLabel: string
}

/** Compact commercial / workflow status summary (no contract-readiness). */
export function WeddingOverviewBand(props: OverviewBandProps) {
  return (
    <section
      className={styles.overviewBand}
      aria-label="Podsumowanie zlecenia"
      data-testid="wedding-overview-band"
    >
      <div className={styles.bandItem}>
        <span className={styles.bandLabel}>Aktualny etap</span>
        <span className={styles.bandValue}>{props.stageLabel}</span>
      </div>
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
    </section>
  )
}

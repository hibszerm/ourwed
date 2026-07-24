import type { DashboardV2Kpi } from '../buildDashboardV2Model'
import styles from '../DashboardV2.module.css'

export function BusinessOverview({ kpis }: { kpis: DashboardV2Kpi[] }) {
  return (
    <section className={styles.section} aria-label="Przegląd biznesowy">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Przegląd studia</h2>
      </div>
      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <article key={kpi.id} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{kpi.label}</p>
            <p className={styles.kpiValue}>{kpi.value}</p>
            {kpi.hint ? <p className={styles.kpiHint}>{kpi.hint}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

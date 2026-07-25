import type { CompletenessItem } from '@/lib/utils/weddingContractReadiness'
import styles from './WeddingDetailV2.module.css'

interface WeddingIssuesSummaryProps {
  missing: CompletenessItem[]
  onOpenContractTab: () => void
}

export function WeddingIssuesSummary({
  missing,
  onOpenContractTab,
}: WeddingIssuesSummaryProps) {
  if (missing.length === 0) {
    return (
      <section
        className={styles.issuesBlock}
        data-testid="wedding-issues-summary"
      >
        <h2 className={styles.sectionHeading}>Do uzupełnienia</h2>
        <p className={styles.issuesReady}>Gotowe do wygenerowania umowy</p>
      </section>
    )
  }

  const preview = missing.slice(0, 5)

  return (
    <section
      className={styles.issuesBlock}
      data-testid="wedding-issues-summary"
    >
      <div className={styles.issuesHeader}>
        <h2 className={styles.sectionHeading}>Do uzupełnienia</h2>
        <span className={styles.issuesCount}>
          {missing.length}{' '}
          {missing.length === 1 ? 'element' : 'elementy'}
        </span>
      </div>
      <ul className={styles.issuesList}>
        {preview.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
      {missing.length > preview.length ? (
        <p className={styles.contextMuted}>
          +{missing.length - preview.length} więcej
        </p>
      ) : null}
      <button
        type="button"
        className={styles.textAction}
        onClick={onOpenContractTab}
      >
        Przejdź do gotowości umowy
      </button>
    </section>
  )
}

import type { RecoveryFieldComparison, RecoverySectionSummary } from '../types'
import type { FieldEvidenceRef, SharedEvidenceSource } from '../groupSectionEvidence'
import styles from './RecoveryFieldComparisonRow.module.css'

function formatValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function stateLabel(state: RecoveryFieldComparison['state']): string {
  switch (state) {
    case 'missing_current':
      return 'Brak w zleceniu'
    case 'same':
      return 'Zgodne'
    case 'different':
      return 'Wartości różnią się'
    case 'missing_extracted':
      return 'Nie znaleziono w umowie'
    case 'invalid_extracted':
      return 'Niepoprawna wartość'
    default:
      return 'Informacyjne'
  }
}

export function RecoveryFieldComparisonRow({
  field,
  evidenceRef,
  sharedSources,
  interactionDisabled = false,
  onActionChange,
}: {
  field: RecoveryFieldComparison
  evidenceRef?: FieldEvidenceRef
  sharedSources?: SharedEvidenceSource[]
  interactionDisabled?: boolean
  onActionChange: (action: RecoveryFieldComparison['selectedAction']) => void
}) {
  const disabled =
    field.state === 'invalid_extracted' ||
    field.state === 'missing_extracted' ||
    field.state === 'unsupported' ||
    field.state === 'same'
    || interactionDisabled

  const shared =
    evidenceRef?.sharedSourceId && sharedSources
      ? sharedSources.find((s) => s.id === evidenceRef.sharedSourceId)
      : null
  const uniqueEvidence = evidenceRef
    ? evidenceRef.uniqueEvidence
    : field.evidence[0] ?? null

  return (
    <article className={styles.row} data-state={field.state}>
      <div className={styles.header}>
        <h3 className={styles.label}>{field.label}</h3>
        <span className={styles.badge}>{stateLabel(field.state)}</span>
      </div>

      <div className={styles.columns}>
        <div>
          <p className={styles.colLabel}>Obecnie</p>
          <p className={styles.value}>{formatValue(field.currentValue)}</p>
        </div>
        <div>
          <p className={styles.colLabel}>Po zmianie</p>
          <p className={styles.value}>{formatValue(field.extractedValue)}</p>
        </div>
      </div>

      {shared ? (
        <details className={styles.evidence}><summary>Pokaż fragment umowy · {shared.label}</summary><blockquote><p>{shared.quote}</p>{shared.page ? <footer>Strona {shared.page}</footer> : null}</blockquote></details>
      ) : uniqueEvidence ? (
        <details className={styles.evidence}>
          <summary>Pokaż fragment umowy</summary>
          <blockquote>
            <p>{uniqueEvidence.quote}</p>
            {uniqueEvidence.page ? <footer>Strona {uniqueEvidence.page}</footer> : null}
          </blockquote>
        </details>
      ) : null}

      {field.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {field.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className={styles.actions}>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={field.selectedAction === 'use_extracted'}
              onChange={(event) => onActionChange(event.target.checked
                ? 'use_extracted'
                : field.state === 'different' ? 'keep_current' : 'skip')}
            />
            Zastosuj tę zmianę
          </label>
          {field.state === 'different' && field.selectedAction !== 'use_extracted' ? (
            <p className={styles.sourceRef}>Inna wartość w zleceniu</p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function SharedEvidenceBlocks({
  sources,
}: {
  sources: SharedEvidenceSource[]
}) {
  if (sources.length === 0) return null
  return (
    <div className={styles.sharedEvidence}>
      {sources.map((source) => (
        <blockquote key={source.id} className={styles.evidence}>
          <p className={styles.sourceRef}>{source.label}</p>
          <p>{source.quote}</p>
          {source.page ? <footer>Strona {source.page}</footer> : null}
        </blockquote>
      ))}
    </div>
  )
}

export function RecoverySectionSummaryGrid({
  sections,
}: {
  sections: RecoverySectionSummary[]
}) {
  const statusLabel = (status: RecoverySectionSummary['status']) => {
    switch (status) {
      case 'found':
        return 'Znaleziono'
      case 'partial':
        return 'Częściowe dane'
      case 'review':
        return 'Wymaga sprawdzenia'
      default:
        return 'Nie znaleziono'
    }
  }

  return (
    <div className={styles.summaryGrid}>
      {sections.map((section) => (
        <div key={section.sectionKey} className={styles.summaryCard}>
          <p className={styles.summaryTitle}>{section.label}</p>
          <p className={styles.summaryStatus}>{statusLabel(section.status)}</p>
        </div>
      ))}
    </div>
  )
}

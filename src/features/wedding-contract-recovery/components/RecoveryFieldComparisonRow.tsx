import { useEffect, useRef } from 'react'
import type { RecoveryFieldComparison } from '../types'
import type { FieldEvidenceRef, SharedEvidenceSource } from '../groupSectionEvidence'
import type { RecoveryDecisionGroup } from '../presentation'
import { formatRecoveryValue } from '../presentation'
import styles from './RecoveryFieldComparisonRow.module.css'

export function RecoveryLogicalComparisonCard({
  decision,
  evidenceRef,
  sharedSources,
  currencyCode,
  onActionChange,
}: {
  decision: RecoveryDecisionGroup
  evidenceRef?: FieldEvidenceRef
  sharedSources?: SharedEvidenceSource[]
  currencyCode?: string
  onActionChange: (action: RecoveryFieldComparison['selectedAction'], fieldKeys: string[]) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const selected = decision.action === 'use_extracted'
  const mixed = decision.action === 'mixed'
  const disabled = decision.actionableFields.length === 0
  const badge = decision.state === 'same' ? 'Bez zmian'
    : decision.state === 'unsupported' ? 'Tylko do wglądu'
      : decision.state === 'invalid_extracted' ? 'Sprawdź dane' : null
  const field = decision.fields[0]
  const shared = evidenceRef?.sharedSourceId && sharedSources
    ? sharedSources.find((source) => source.id === evidenceRef.sharedSourceId)
    : null
  const uniqueEvidence = evidenceRef ? evidenceRef.uniqueEvidence : field.evidence[0] ?? null

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = mixed
  }, [mixed])

  const setAction = (apply: boolean) => {
    const action = apply ? 'use_extracted' : 'skip'
    onActionChange(action, decision.actionableFields.map((item) => item.fieldKey))
  }

  return (
    <article className={styles.row} data-state={decision.state} data-selected={selected} data-mixed={mixed}>
      <div className={styles.header}>
        <h3 className={styles.label}>{decision.label}</h3>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </div>

      <div className={styles.comparison}>
        <div className={styles.valueSide} data-side="current">
          <p className={styles.colLabel}>Obecnie</p>
          <p className={styles.value}>{decision.id === 'partner1.address' ? decision.currentValue : formatRecoveryValue(field, decision.currentValue === '—' ? null : decision.currentValue, currencyCode)}</p>
        </div>
        <span className={styles.arrow} aria-hidden="true">→</span>
        <div className={styles.valueSide} data-side="source">
          <p className={styles.colLabel}>Z umowy</p>
          <p className={styles.value}>{decision.id === 'partner1.address' ? decision.extractedValue : formatRecoveryValue(field, decision.extractedValue === '—' ? null : decision.extractedValue, currencyCode)}</p>
        </div>
      </div>

      {shared ? (
        <details className={styles.evidence}>
          <summary>Pokaż fragment umowy · {shared.label}</summary>
          <blockquote><p>{shared.quote}</p></blockquote>
        </details>
      ) : uniqueEvidence ? (
        <details className={styles.evidence}>
          <summary>Pokaż fragment umowy</summary>
          <blockquote><p>{uniqueEvidence.quote}</p></blockquote>
        </details>
      ) : null}

      {decision.fields.flatMap((item) => item.warnings).length > 0 ? (
        <ul className={styles.warnings}>
          {Array.from(new Set(decision.fields.flatMap((item) => item.warnings))).map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}

      {!disabled ? (
        <label className={styles.selection} data-selected={selected} data-mixed={mixed}>
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={selected}
            aria-label={`Zastosuj zmianę: ${decision.label}`}
            onChange={(event) => setAction(event.target.checked)}
          />
          <span className={styles.selectionMark} aria-hidden="true">{selected ? '✓' : ''}</span>
          <span>{mixed ? 'Część tej zmiany jest już zaznaczona' : selected ? 'Ta zmiana zostanie zastosowana' : 'Zastosuj zmianę'}</span>
        </label>
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
        <details key={source.id} className={styles.evidence}>
          <summary>Pokaż fragment umowy · {source.label}</summary>
          <blockquote><p>{source.quote}</p></blockquote>
        </details>
      ))}
    </div>
  )
}

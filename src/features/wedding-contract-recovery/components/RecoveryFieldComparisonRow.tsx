import { useEffect, useRef, useState } from 'react'
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
  const [evidenceOpen, setEvidenceOpen] = useState(false)
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
      <div className={styles.mainRow}>
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

        <div className={styles.rowActions}>
          {shared ? (
            <button className={styles.evidenceToggle} type="button" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((open) => !open)}>{evidenceOpen ? 'Ukryj fragment' : 'Pokaż fragment'}</button>
          ) : uniqueEvidence ? (
            <button className={styles.evidenceToggle} type="button" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((open) => !open)}>{evidenceOpen ? 'Ukryj fragment' : 'Pokaż fragment'}</button>
          ) : <span className={styles.noEvidence} aria-hidden="true" />}

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
              <span>{mixed ? 'Częściowo' : selected ? 'Wybrano' : 'Zastosuj'}</span>
            </label>
          ) : <span className={styles.readOnlyState}>{badge}</span>}
        </div>
      </div>

      {evidenceOpen ? (
        <div className={styles.evidenceContent}>
          <p className={styles.evidenceTitle}>Fragment umowy{shared ? ` · ${shared.label}` : ''}</p>
          <blockquote><p>{shared?.quote ?? uniqueEvidence?.quote}</p></blockquote>
        </div>
      ) : null}

      {decision.fields.flatMap((item) => item.warnings).length > 0 ? (
        <ul className={styles.warnings}>
          {Array.from(new Set(decision.fields.flatMap((item) => item.warnings))).map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </article>
  )
}

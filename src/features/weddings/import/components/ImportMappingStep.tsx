import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import type { ColumnMapping, ImportField } from '../types'
import { IMPORT_FIELD_LABELS, SINGLE_TARGET_FIELDS } from '../types'
import {
  describeColumnMappingBlock,
  isRequiredImportField,
  mappedColumnsSummary,
} from '../importPresentation'
import styles from './importWorkspace.module.css'

type ImportMappingStepProps = {
  mappings: ColumnMapping[]
  sampleValues: Map<string, string[]>
  savedMappingApplied: boolean
  onChangeMapping: (sourceColumnId: string, targetField: ImportField) => void
  onBack: () => void
  onContinue: () => void
}

export function ImportMappingStep({
  mappings,
  sampleValues,
  savedMappingApplied,
  onChangeMapping,
  onBack,
  onContinue,
}: ImportMappingStepProps) {
  const blockReason = describeColumnMappingBlock(mappings)
  const mappedCount = mappings.filter((mapping) => mapping.targetField !== 'ignore').length

  return (
    <section className={styles.stack} aria-labelledby="import-mapping-heading">
      <div>
        <h2 id="import-mapping-heading" className={styles.heading}>
          Dopasuj kolumny
        </h2>
        <p className={styles.lead}>
          Powiedz OurWed, która kolumna z pliku odpowiada danym ślubu.
        </p>
        <p className={styles.summary}>{mappedColumnsSummary(mappedCount, mappings.length)}</p>
        {savedMappingApplied ? (
          <p className={styles.hint}>Zastosowano wcześniej używany układ kolumn.</p>
        ) : null}
      </div>

      <div className={styles.mappingPanel}>
        {mappings.map((mapping, index) => {
          const samples = (sampleValues.get(mapping.sourceColumnId) ?? []).slice(0, 3)
          const detected =
            mapping.suggestedBy === 'deterministic' || mapping.suggestedBy === 'saved_mapping'
          const ignored = mapping.targetField === 'ignore'
          const required = isRequiredImportField(mapping.targetField)
          const sourceName = mapping.sourceHeader.trim() || `Kolumna ${index + 1}`
          const statusBits = [
            required ? 'Wymagane' : null,
            detected && !ignored ? 'Wykryto' : null,
          ].filter(Boolean)

          return (
            <article
              key={mapping.sourceColumnId}
              className={styles.mappingItem}
              data-ignored={ignored ? 'true' : 'false'}
            >
              <div className={styles.mappingSource}>
                <p className={styles.sourceName}>{sourceName}</p>
                <p className={styles.samples}>{samples.join(' · ') || '—'}</p>
              </div>
              <div className={styles.mappingTarget}>
                <Select
                  label="Importuj jako"
                  aria-label={`Importuj kolumnę ${sourceName} jako`}
                  value={mapping.targetField}
                  onChange={(event) =>
                    onChangeMapping(mapping.sourceColumnId, event.target.value as ImportField)
                  }
                >
                  {(['ignore', ...SINGLE_TARGET_FIELDS] as ImportField[]).map((field) => (
                    <option key={field} value={field}>
                      {IMPORT_FIELD_LABELS[field]}
                    </option>
                  ))}
                </Select>
                {statusBits.length > 0 ? (
                  <p className={styles.mappingStatus}>{statusBits.join(' · ')}</p>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      <div className={`${styles.actions} ${styles.stepActions}`}>
        <Button type="button" variant="secondary" onClick={onBack}>
          Wstecz
        </Button>
        <Button type="button" variant="primary" disabled={Boolean(blockReason)} onClick={onContinue}>
          Sprawdź dane
        </Button>
        {blockReason ? <p className={styles.ctaHint}>{blockReason}</p> : null}
      </div>
    </section>
  )
}

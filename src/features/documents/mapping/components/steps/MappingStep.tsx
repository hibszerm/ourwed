import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { buildPreviewOverlays } from '../../mapping/previewOverlays'
import { DocumentPreviewPane } from '../../preview/DocumentPreviewPane'
import { FieldMappingRow } from '../FieldMappingRow'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

/**
 * Mapping Review — user reviews AI proposals (Accept / Change / Ignore).
 * Free placement and heuristic suggestion UI are no longer in the active flow.
 */
export function MappingStep() {
  const { state, mapField, ignoreField, acceptSuggestion } = useMappingWizard()
  const { draft } = state
  const analysis = draft.analysis

  const overlays = useMemo(
    () =>
      buildPreviewOverlays({
        fields: draft.fields,
        manualMappings: draft.manualMappings,
      }),
    [draft.fields, draft.manualMappings],
  )

  if (!analysis) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>
          Najpierw uruchom analizę dokumentu w poprzednim kroku.
        </p>
      </section>
    )
  }

  const aiFields = analysis.aiAnalysis?.fields
  const total = draft.fields.length
  const confirmed = draft.fields.filter((f) => f.status === 'connected').length
  const rejected = draft.fields.filter((f) => f.status === 'ignored').length
  const pending = draft.fields.filter(
    (f) => f.status === 'needs_configuration',
  ).length
  const documentType = analysis.aiAnalysis?.documentType

  const pendingFields = draft.fields.filter(
    (f) => f.status === 'needs_configuration',
  )
  const confirmedFields = draft.fields.filter((f) => f.status === 'connected')
  const ignoredFields = draft.fields.filter((f) => f.status === 'ignored')

  return (
    <section className={styles.stepPanel} aria-labelledby="mapping-step-title">
      <div className={styles.stepIntro}>
        <h2 id="mapping-step-title" className={styles.stepTitle}>
          Przegląd mapowania
        </h2>
        <p className={styles.stepBody}>
          OurWed zaproponował pola dynamiczne na podstawie Twojego kontraktu.
          Zaakceptuj propozycje, zmień źródło albo pomiń — bez ręcznego
          mapowania wszystkiego od zera.
        </p>
      </div>

      <div className={styles.analysisSummary}>
        <span className={styles.statusPillSuccess}>
          <CheckCircle2 size={14} aria-hidden />
          Analiza ukończona
        </span>
        <p className={styles.analysisSummaryText}>
          Znaleziono <strong>{total}</strong> elementów dynamicznych
          {documentType ? (
            <>
              {' '}
              · typ: <strong>{documentType}</strong>
            </>
          ) : null}
          {aiFields ? (
            <>
              {' '}
              · {confirmed} zaakceptowanych · {pending} do przeglądu ·{' '}
              {rejected} pominiętych
            </>
          ) : null}
        </p>
      </div>

      <div className={styles.analysisSplit}>
        <DocumentPreviewPane
          sourceText={analysis.sourceText}
          structure={analysis.structure}
          overlays={overlays}
          fileName={draft.sourceFileName}
          hint="Podgląd Twojego DOCX — propozycje AI po prawej"
        />

        <aside className={styles.detectedListPane}>
          <header className={styles.paneHeader}>
            <h3 className={styles.paneTitle}>Propozycje AI</h3>
            <p className={styles.paneMeta}>
              Element kontraktu → pole OurWed · pewność
            </p>
          </header>

          <div className={styles.mappingGroups}>
            {pendingFields.length > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>Do przeglądu</h4>
                <ul className={styles.detectedList}>
                  {pendingFields.map((field) => (
                    <li key={field.id} className={styles.mappingRowWrap}>
                      <FieldMappingRow
                        field={field}
                        onMap={(key) => mapField(field.id, key)}
                        onAccept={() => acceptSuggestion(field.id)}
                        onIgnore={() => ignoreField(field.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {confirmedFields.length > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>Zaakceptowane</h4>
                <ul className={styles.detectedList}>
                  {confirmedFields.map((field) => (
                    <li key={field.id} className={styles.mappingRowWrap}>
                      <FieldMappingRow
                        field={field}
                        onMap={(key) => mapField(field.id, key)}
                        onIgnore={() => ignoreField(field.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ignoredFields.length > 0 && (
              <section>
                <h4 className={styles.mappingGroupTitle}>Pominięte</h4>
                <ul className={styles.detectedList}>
                  {ignoredFields.map((field) => (
                    <li key={field.id} className={styles.mappingRowWrap}>
                      <FieldMappingRow
                        field={field}
                        onMap={(key) => mapField(field.id, key)}
                        onIgnore={() => ignoreField(field.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {total === 0 && (
              <p className={styles.emptyFieldsHint}>
                Analizator nie zaproponował pól. Możesz wrócić i uruchomić
                analizę ponownie.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

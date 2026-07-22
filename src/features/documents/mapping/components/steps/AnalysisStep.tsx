import { useEffect, useMemo } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import { buildPreviewOverlays } from '../../mapping/previewOverlays'
import { DocumentPreviewPane } from '../../preview/DocumentPreviewPane'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function AnalysisStep() {
  const { state, runAnalysis } = useMappingWizard()
  const { draft, analysisStatus, analysisError } = state
  const analysis = draft.analysis

  const overlays = useMemo(
    () =>
      buildPreviewOverlays({
        fields: draft.fields,
        manualMappings: draft.manualMappings,
      }),
    [draft.fields, draft.manualMappings],
  )

  useEffect(() => {
    if (
      (draft.sourceFileName || draft.sourceDocxPath) &&
      analysisStatus === 'idle' &&
      !analysis
    ) {
      void runAnalysis()
    }
  }, [
    draft.sourceFileName,
    draft.sourceDocxPath,
    analysisStatus,
    analysis,
    runAnalysis,
  ])

  const connectedCount = draft.fields.filter(
    (f) => f.status === 'connected',
  ).length
  const pendingCount = draft.fields.filter(
    (f) => f.status === 'needs_configuration',
  ).length

  return (
    <section className={styles.stepPanel} aria-labelledby="analysis-step-title">
      <div className={styles.stepIntro}>
        <h2 id="analysis-step-title" className={styles.stepTitle}>
          Analiza kontraktu
        </h2>
        <p className={styles.stepBody}>
          Odczytujemy treść Twojego pliku i oznaczamy miejsca, które mogą być
          uzupełniane danymi ślubu. Podgląd zawsze pochodzi z przesłanego
          dokumentu.
        </p>
      </div>

      {analysisStatus === 'running' && (
        <div className={styles.analysisProgress} role="status">
          <LoaderCircle
            size={22}
            className={styles.spin}
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            <p className={styles.analysisProgressTitle}>
              Odczytywanie i analiza dokumentu…
            </p>
            <p className={styles.helperText}>
              {draft.sourceFileName
                ? `Plik: ${draft.sourceFileName}`
                : 'Wyodrębnianie tekstu z DOCX.'}
            </p>
          </div>
        </div>
      )}

      {analysisStatus === 'error' && (
        <div className={styles.analysisError}>
          <p className={styles.errorText}>{analysisError}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void runAnalysis()}
          >
            Spróbuj ponownie
          </Button>
        </div>
      )}

      {analysisStatus === 'success' && analysis && (
        <div className={styles.analysisResult}>
          <div className={styles.analysisSummary}>
            <span className={styles.statusPillSuccess}>
              <CheckCircle2 size={14} aria-hidden />
              Analiza ukończona
            </span>
            <p className={styles.analysisSummaryText}>
              {draft.fields.length === 0 ? (
                <>
                  Odczytano dokument — nie wykryto znaczników ani typowych
                  wzorców. Możesz przejść do mapowania.
                </>
              ) : (
                <>
                  Wykryto <strong>{draft.fields.length}</strong> obszarów ·{' '}
                  <strong>{connectedCount}</strong> wstępnie połączonych ·{' '}
                  <strong>{pendingCount}</strong> do akceptacji / konfiguracji
                </>
              )}
            </p>
          </div>

          <div className={styles.analysisSplit}>
            <DocumentPreviewPane
              sourceText={analysis.sourceText}
              structure={analysis.structure}
              overlays={overlays}
              fileName={draft.sourceFileName}
            />

            <aside className={styles.detectedListPane}>
              <header className={styles.paneHeader}>
                <h3 className={styles.paneTitle}>Wykryte obszary</h3>
              </header>
              {draft.fields.length === 0 ? (
                <p className={styles.emptyFieldsHint}>
                  Brak znaczników w tekście. Po lewej widzisz treść swojego
                  pliku DOCX.
                </p>
              ) : (
                <ul className={styles.detectedList}>
                  {draft.fields.map((field) => {
                    const key = field.mappedKey ?? field.suggestedKey
                    const def = key ? getVariableDef(key) : undefined
                    return (
                      <li key={field.id} className={styles.detectedItem}>
                        <div className={styles.detectedItemHead}>
                          <p className={styles.detectedLabel}>{field.label}</p>
                          {field.status === 'connected' ? (
                            <span className={styles.statusPillSuccess}>
                              Połączono
                            </span>
                          ) : (
                            <span className={styles.statusPillWarning}>
                              Do konfiguracji
                            </span>
                          )}
                        </div>
                        {def && (
                          <p className={styles.detectedSource}>
                            Źródło: {def.key}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </aside>
          </div>
        </div>
      )}

      {analysisStatus === 'idle' &&
        !draft.sourceFileName &&
        !draft.sourceDocxPath && (
          <p className={styles.helperText}>
            Najpierw prześlij dokument w poprzednim kroku.
          </p>
        )}
    </section>
  )
}

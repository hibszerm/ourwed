import { useEffect, useMemo } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buildPreviewOverlays } from '../../mapping/previewOverlays'
import { DocumentPreviewPane } from '../../preview/DocumentPreviewPane'
import { AiReport } from '../AiReport'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function AnalysisStep() {
  const { state, runAnalysis, goNext } = useMappingWizard()
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

  return (
    <section className={styles.stepPanel} aria-labelledby="analysis-step-title">
      <div className={styles.stepIntro}>
        <h2 id="analysis-step-title" className={styles.stepTitle}>
          Analiza AI
        </h2>
        <p className={styles.stepBody}>
          OurWed czyta Twój kontrakt i odkrywa, jakich informacji potrzebuje
          szablon — aby później uzupełnić je z ankiety, CRM i ustawień studia.
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
              Uczę się, czego wymaga Twój kontrakt…
            </p>
            <p className={styles.helperText}>
              {draft.sourceFileName
                ? `Plik: ${draft.sourceFileName}`
                : 'Czytam dokument i wykrywam potrzebne informacje.'}
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
          <AiReport
            ai={analysis.aiAnalysis}
            fields={draft.fields}
            questionnaire={draft.questionnaireDraft}
          />

          <div className={styles.analysisSplit}>
            <DocumentPreviewPane
              sourceText={analysis.sourceText}
              structure={analysis.structure}
              overlays={overlays}
              fileName={draft.sourceFileName}
              hint="Podgląd Twojego dokumentu — tylko do odczytu"
            />
          </div>

          <div className={styles.stepActions}>
            <Button type="button" variant="primary" onClick={goNext}>
              Przejdź do ankiety
            </Button>
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

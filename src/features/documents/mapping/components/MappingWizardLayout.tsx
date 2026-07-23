import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMappingWizard } from '../state/useMappingWizard'
import { MappingWizardStepper } from './MappingWizardStepper'
import { UploadStep } from './steps/UploadStep'
import { AnalysisStep } from './steps/AnalysisStep'
import { QuestionnaireStep } from './steps/QuestionnaireStep'
import { SaveStep } from './steps/SaveStep'
import styles from '../MappingWizard.module.css'

/**
 * @deprecated Mapping Wizard — superseded by template-first SimpleContractImportFlow.
 * Do not mount in routes. Kept for reference / extraction utilities only.
 */
export function MappingWizardLayout({
  templateId,
  templateName,
  onUploadFile,
}: {
  templateId: string
  templateName: string
  onUploadFile: (file: File) => Promise<{
    templateVersionId: string
    sourceFileName: string
    sourceDocxPath: string | null
    sourceBytes: ArrayBuffer
  }>
}) {
  const { state, setStep, goNext, goBack, canGoNext, canGoBack } =
    useMappingWizard()

  return (
    <div className={styles.wizard}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link
            to={`/ustawienia/dokumenty/szablony/${templateId}`}
            className={styles.backLink}
          >
            <ArrowLeft size={16} aria-hidden />
            Wróć do szablonu
          </Link>
        </div>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>Import kontraktu</p>
          <h1 className={styles.title}>{templateName}</h1>
          <p className={styles.subtitle}>
            Prześlij umowę — AI zrozumie, czego wymaga, i przygotuje ankietę
            dla pary.
          </p>
        </div>
        <MappingWizardStepper current={state.step} onSelect={setStep} />
      </header>

      <main className={styles.main}>
        {state.step === 'upload' && (
          <UploadStep onUploadFile={onUploadFile} />
        )}
        {state.step === 'analysis' && <AnalysisStep />}
        {state.step === 'questionnaire' && <QuestionnaireStep />}
        {state.step === 'save' && <SaveStep templateId={templateId} />}
      </main>

      <footer className={styles.footer}>
        <Button
          type="button"
          variant="ghost"
          disabled={!canGoBack || state.step === 'save'}
          onClick={goBack}
        >
          Wstecz
        </Button>
        {state.step === 'upload' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Analizuj dokument
          </Button>
        )}
        {state.step === 'analysis' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Przejdź do ankiety
          </Button>
        )}
        {state.step === 'questionnaire' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Przejdź do utworzenia typu
          </Button>
        )}
      </footer>
    </div>
  )
}

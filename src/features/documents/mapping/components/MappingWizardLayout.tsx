import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMappingWizard } from '../state/useMappingWizard'
import { MappingWizardStepper } from './MappingWizardStepper'
import { UploadStep } from './steps/UploadStep'
import { AnalysisStep } from './steps/AnalysisStep'
import { MappingStep } from './steps/MappingStep'
import { ComponentsStep } from './steps/ComponentsStep'
import { ClausesStep } from './steps/ClausesStep'
import styles from '../MappingWizard.module.css'

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
          <p className={styles.eyebrow}>Konfiguracja szablonu</p>
          <h1 className={styles.title}>{templateName}</h1>
          <p className={styles.subtitle}>
            Pracujesz na swoim kontrakcie — OurWed wykrywa dynamiczne obszary
            i pomaga je podłączyć do danych ślubu.
          </p>
        </div>
        <MappingWizardStepper current={state.step} onSelect={setStep} />
      </header>

      <main className={styles.main}>
        {state.step === 'upload' && (
          <UploadStep onUploadFile={onUploadFile} />
        )}
        {state.step === 'analysis' && <AnalysisStep />}
        {state.step === 'mapping' && <MappingStep />}
        {state.step === 'components' && <ComponentsStep />}
        {state.step === 'clauses' && <ClausesStep />}
      </main>

      <footer className={styles.footer}>
        <Button
          type="button"
          variant="ghost"
          disabled={!canGoBack}
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
            Przejdź do analizy
          </Button>
        )}
        {state.step === 'analysis' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Przejdź do mapowania
          </Button>
        )}
        {state.step === 'mapping' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Przejdź do sekcji
          </Button>
        )}
        {state.step === 'components' && (
          <Button
            type="button"
            variant="primary"
            disabled={!canGoNext}
            onClick={goNext}
          >
            Przejdź do klauzul
          </Button>
        )}
        {state.step === 'clauses' && (
          <Button type="button" variant="primary" disabled title="Kolejny etap">
            Podgląd — wkrótce
          </Button>
        )}
      </footer>
    </div>
  )
}

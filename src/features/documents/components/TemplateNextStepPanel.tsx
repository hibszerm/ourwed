import { useNavigate } from 'react-router-dom'
import { Check, FileText, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

function configurationPath(templateId: string) {
  return `/ustawienia/dokumenty/szablony/${templateId}/konfiguracja`
}

function OnboardingPanel({ templateId }: { templateId: string }) {
  const navigate = useNavigate()

  return (
    <section
      className={styles.nextStepCard}
      aria-labelledby="next-step-title"
    >
      <div className={styles.nextStepIconWrap} aria-hidden>
        <Sparkles size={36} strokeWidth={1.4} />
      </div>
      <h2 id="next-step-title" className={styles.nextStepTitle}>
        Analiza AI
      </h2>
      <p className={styles.nextStepBody}>
        Prześlij kontrakt — OurWed wykryje informacje do zebrania od pary i
        utworzy typ ankiety. Bez mapowania i bez technicznych ustawień.
      </p>

      <ol className={styles.roadmap}>
        <li className={styles.roadmapItem}>
          <span className={styles.roadmapNum}>1</span>
          <div>
            <p className={styles.roadmapTitle}>Prześlij kontrakt</p>
            <p className={styles.roadmapDesc}>DOCX lub PDF</p>
          </div>
        </li>
        <li className={styles.roadmapItem}>
          <span className={styles.roadmapNum}>2</span>
          <div>
            <p className={styles.roadmapTitle}>AI analizuje</p>
            <p className={styles.roadmapDesc}>
              Wykrywa informacje potrzebne w umowie
            </p>
          </div>
        </li>
        <li className={styles.roadmapItem}>
          <span className={styles.roadmapNum}>3</span>
          <div>
            <p className={styles.roadmapTitle}>Wybierz, o co pytać</p>
            <p className={styles.roadmapDesc}>Prosta lista checkboxów</p>
          </div>
        </li>
        <li className={styles.roadmapItem}>
          <span className={styles.roadmapNum}>4</span>
          <div>
            <p className={styles.roadmapTitle}>Utwórz ankietę</p>
            <p className={styles.roadmapDesc}>
              Nowy typ w bibliotece ankiet
            </p>
          </div>
        </li>
      </ol>

      <div className={styles.nextStepCta}>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate(configurationPath(templateId))}
        >
          Prześlij kontrakt / uruchom AI
        </Button>
      </div>
    </section>
  )
}

function ConfiguredSummary({
  template,
}: {
  template: DocumentTemplateSummary
}) {
  const navigate = useNavigate()

  return (
    <section
      className={styles.configuredCard}
      aria-labelledby="configured-title"
    >
      <div className={styles.configuredHeader}>
        <div>
          <h2 id="configured-title" className={styles.configuredTitle}>
            Ankieta powiązana
          </h2>
          <p className={styles.configuredSubtitle}>
            Typ ankiety jest gotowy do generowania linków w module Ankiety.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate(configurationPath(template.id))}
        >
          Analizuj ponownie
        </Button>
      </div>
      <ul className={styles.configuredStats}>
        <li className={styles.configuredStat}>
          <Check size={16} strokeWidth={2} className={styles.configuredCheck} aria-hidden />
          <span>Plik kontraktu zapisany</span>
        </li>
        <li className={styles.configuredStat}>
          <FileText size={16} strokeWidth={2} className={styles.configuredCheck} aria-hidden />
          <span>Gotowy do generowania umów</span>
        </li>
      </ul>
      <div className={styles.nextStepCta}>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate('/ankiety')}
        >
          Przejdź do ankiet
        </Button>
      </div>
    </section>
  )
}

export function TemplateNextStepPanel({
  configured,
  template,
}: {
  configured: boolean
  template: DocumentTemplateSummary
}) {
  if (configured) {
    return <ConfiguredSummary template={template} />
  }
  return <OnboardingPanel templateId={template.id} />
}

/** @deprecated Reserved layout anchor — unused in simplified flow. */
export function TemplateMappingSlots() {
  return (
    <div
      className={styles.mappingSlots}
      aria-hidden
      data-reserved="mapping-sections"
    />
  )
}

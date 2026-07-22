import { useNavigate } from 'react-router-dom'
import { Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

function configurationPath(templateId: string) {
  return `/ustawienia/dokumenty/szablony/${templateId}/konfiguracja`
}

const ROADMAP = [
  {
    step: 1,
    title: 'Wykryj pola',
    description: 'Połącz dane ślubu z treścią dokumentu.',
  },
  {
    step: 2,
    title: 'Skonfiguruj elementy pakietu',
    description: 'Pokaż tylko to, co zawiera umowa.',
  },
  {
    step: 3,
    title: 'Skonfiguruj klauzule opcjonalne',
    description: 'Włącz warunki zależne od usług.',
  },
  {
    step: 4,
    title: 'Generuj umowy',
    description: 'Twórz gotowe dokumenty do podpisu.',
  },
]

function OnboardingPanel({ templateId }: { templateId: string }) {
  const navigate = useNavigate()

  return (
    <section
      className={styles.nextStepCard}
      aria-labelledby="next-step-title"
    >
      <div className={styles.nextStepIconWrap} aria-hidden>
        <FileText size={36} strokeWidth={1.4} />
      </div>
      <h2 id="next-step-title" className={styles.nextStepTitle}>
        Następny krok
      </h2>
      <p className={styles.nextStepBody}>
        Plik DOCX jest już w bibliotece. Aby generować umowy automatycznie,
        trzeba najpierw skonfigurować szablon.
      </p>

      <ol className={styles.roadmap}>
        {ROADMAP.map((item) => (
          <li key={item.step} className={styles.roadmapItem}>
            <span className={styles.roadmapNum}>{item.step}</span>
            <div>
              <p className={styles.roadmapTitle}>{item.title}</p>
              <p className={styles.roadmapDesc}>{item.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.nextStepBenefits}>
        <p className={styles.nextStepBenefitsTitle}>
          Po konfiguracji ten szablon automatycznie:
        </p>
        <ul className={styles.nextStepBenefitsList}>
          <li>uzupełni dane pary i ślubu</li>
          <li>wstawi elementy pakietu</li>
          <li>przeliczy płatności</li>
          <li>doda opcjonalne klauzule</li>
          <li>wygeneruje umowę gotową do podpisu</li>
        </ul>
      </div>

      <div className={styles.nextStepCta}>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate(configurationPath(templateId))}
        >
          Rozpocznij konfigurację
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
  const stats = [
    {
      label: `${template.variableCount} zmapowanych zmiennych`,
      count: template.variableCount,
    },
    {
      label: `${template.componentCount} komponentów pakietu`,
      count: template.componentCount,
    },
    {
      label: `${template.blockCount} opcjonalnych klauzul / bloków`,
      count: template.blockCount,
    },
  ]

  return (
    <section
      className={styles.configuredCard}
      aria-labelledby="configured-title"
    >
      <div className={styles.configuredHeader}>
        <div>
          <h2 id="configured-title" className={styles.configuredTitle}>
            Szablon skonfigurowany
          </h2>
          <p className={styles.configuredSubtitle}>
            Mapowanie i struktura są gotowe do dalszej pracy.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate(configurationPath(template.id))}
        >
          Edytuj konfigurację
        </Button>
      </div>
      <ul className={styles.configuredStats}>
        {stats.map((stat) => (
          <li key={stat.label} className={styles.configuredStat}>
            <Check
              size={16}
              strokeWidth={2}
              className={styles.configuredCheck}
              aria-hidden
            />
            <span>{stat.label}</span>
          </li>
        ))}
      </ul>
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

/** Reserved layout anchors — Mapping Wizard lives on its own route. */
export function TemplateMappingSlots() {
  return (
    <div
      className={styles.mappingSlots}
      aria-hidden
      data-reserved="mapping-sections"
    />
  )
}

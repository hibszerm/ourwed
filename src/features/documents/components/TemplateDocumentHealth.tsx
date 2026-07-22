import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DocumentTemplateStatus } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface LifecycleStep {
  id: string
  done: boolean
  title: string
  description: string
  Icon: LucideIcon
}

interface TemplateDocumentHealthProps {
  status: DocumentTemplateStatus
  hasFile: boolean
  hasVersion: boolean
  mappingCompleted: boolean
  configurationCompleted: boolean
}

export function TemplateDocumentHealth({
  status,
  hasFile,
  hasVersion,
  mappingCompleted,
  configurationCompleted,
}: TemplateDocumentHealthProps) {
  const analyzed = mappingCompleted || configurationCompleted
  const questionnaireReady = configurationCompleted
  const productionReady =
    status === 'ready' && hasFile && (analyzed || questionnaireReady)

  const steps: LifecycleStep[] = [
    {
      id: 'uploaded',
      done: hasFile,
      title: 'Przesłany',
      description: 'Kontrakt DOCX lub PDF jest w bibliotece.',
      Icon: Upload,
    },
    {
      id: 'analyzed',
      done: analyzed,
      title: 'Przeanalizowany przez AI',
      description: 'OurWed wykrył informacje potrzebne w umowie.',
      Icon: Sparkles,
    },
    {
      id: 'questionnaire',
      done: questionnaireReady,
      title: 'Ankieta utworzona',
      description: 'Typ ankiety dostępny przy generowaniu linków.',
      Icon: FileCheck,
    },
    {
      id: 'ready',
      done: productionReady || (hasFile && questionnaireReady),
      title: 'Gotowy do generowania umów',
      description: 'Kontrakt + ankieta — bez zmiany formatowania pliku.',
      Icon: BadgeCheck,
    },
  ]

  // Keep hasVersion in the model for callers; version is implied by upload.
  void hasVersion

  return (
    <section className={styles.healthCard} aria-labelledby="doc-health-title">
      <h2 id="doc-health-title" className={styles.healthTitle}>
        Cykl życia dokumentu
      </h2>
      <ul className={styles.lifecycleList}>
        {steps.map((step) => {
          const Icon = step.Icon
          return (
            <li
              key={step.id}
              className={`${styles.lifecycleItem} ${step.done ? styles.lifecycleItemDone : styles.lifecycleItemPending}`}
            >
              <span
                className={`${styles.lifecycleIcon} ${step.done ? styles.lifecycleIconDone : styles.lifecycleIconPending}`}
                aria-hidden
              >
                {step.done ? (
                  <CheckCircle2 size={20} strokeWidth={1.75} />
                ) : (
                  <Circle size={20} strokeWidth={1.75} />
                )}
              </span>
              <div className={styles.lifecycleText}>
                <div className={styles.lifecycleTitleRow}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <p className={styles.lifecycleTitle}>{step.title}</p>
                </div>
                <p className={styles.lifecycleDesc}>{step.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

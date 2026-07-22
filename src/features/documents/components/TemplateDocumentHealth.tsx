import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileCheck,
  Link2,
  Settings2,
  ShieldCheck,
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
  const productionReady =
    status === 'ready' && mappingCompleted && configurationCompleted

  const steps: LifecycleStep[] = [
    {
      id: 'uploaded',
      done: hasFile,
      title: 'Szablon przesłany',
      description: 'Dokument DOCX trafił do biblioteki studia.',
      Icon: Upload,
    },
    {
      id: 'stored',
      done: hasFile,
      title: 'Zapisany bezpiecznie',
      description: 'Plik jest w prywatnym magazynie OurWed.',
      Icon: ShieldCheck,
    },
    {
      id: 'version',
      done: hasVersion,
      title: 'Aktywna wersja',
      description: 'Wybrana wersja będzie używana przy generowaniu.',
      Icon: FileCheck,
    },
    {
      id: 'mapping',
      done: mappingCompleted,
      title: 'Mapowanie ukończone',
      description: 'Pola i sekcje powiązane z danymi ślubu.',
      Icon: Link2,
    },
    {
      id: 'configuration',
      done: configurationCompleted,
      title: 'Konfiguracja ukończona',
      description: 'Pakiet, klauzule i warunki są ustawione.',
      Icon: Settings2,
    },
    {
      id: 'production',
      done: productionReady,
      title: 'Gotowy do produkcji',
      description: 'Szablon może tworzyć umowy do podpisu.',
      Icon: BadgeCheck,
    },
  ]

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

import { Check, FileSpreadsheet, ListChecks, Table2 } from 'lucide-react'
import styles from './WeddingImportStepper.module.css'

export type WeddingImportStepId = 'upload' | 'mapping' | 'review' | 'done'

const STEPS: Array<{
  id: WeddingImportStepId
  label: string
}> = [
  { id: 'upload', label: 'Wybierz plik' },
  { id: 'mapping', label: 'Dopasuj kolumny' },
  { id: 'review', label: 'Sprawdź dane' },
  { id: 'done', label: 'Import zakończony' },
]

const INDEX: Record<WeddingImportStepId, number> = {
  upload: 0,
  mapping: 1,
  review: 2,
  done: 3,
}

export function WeddingImportStepper({
  current,
}: {
  current: WeddingImportStepId
}) {
  const currentIndex = INDEX[current]

  return (
    <nav className={styles.stepper} aria-label="Postęp importu ślubów">
      <ol className={styles.list}>
        {STEPS.map((step, index) => {
          const status =
            index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
          const Icon =
            step.id === 'upload'
              ? FileSpreadsheet
              : step.id === 'mapping'
                ? Table2
                : step.id === 'review'
                  ? ListChecks
                  : Check

          return (
            <li
              key={step.id}
              className={styles.item}
              data-status={status}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className={styles.indicator} aria-hidden>
                {status === 'done' ? (
                  <Check size={14} strokeWidth={2.25} />
                ) : (
                  <Icon size={14} strokeWidth={2} />
                )}
              </span>
              <span className={styles.label}>{step.label}</span>
              {index < STEPS.length - 1 ? (
                <span className={styles.connector} aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

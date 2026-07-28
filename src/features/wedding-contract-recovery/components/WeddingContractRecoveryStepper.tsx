import { Check, FileText, ListChecks, Upload } from 'lucide-react'
import styles from './WeddingContractRecoveryStepper.module.css'

export type RecoveryWizardStep =
  | 'upload'
  | 'processing'
  | 'summary'
  | 'review'
  | 'confirm'
  | 'done'

const STEPS: Array<{ id: RecoveryWizardStep; label: string }> = [
  { id: 'upload', label: 'Wgraj umowę' },
  { id: 'processing', label: 'Analiza' },
  { id: 'summary', label: 'Podsumowanie' },
  { id: 'review', label: 'Sprawdź dane' },
  { id: 'confirm', label: 'Potwierdzenie' },
]

const INDEX: Record<RecoveryWizardStep, number> = {
  upload: 0,
  processing: 1,
  summary: 2,
  review: 3,
  confirm: 4,
  done: 5,
}

export function WeddingContractRecoveryStepper({
  current,
}: {
  current: RecoveryWizardStep
}) {
  const currentIndex = INDEX[current] >= STEPS.length ? STEPS.length - 1 : INDEX[current]

  return (
    <nav className={styles.stepper} aria-label="Postęp uzupełniania danych z umowy">
      <ol className={styles.list}>
        {STEPS.map((step, index) => {
          const status =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
          const Icon =
            step.id === 'upload'
              ? Upload
              : step.id === 'processing'
                ? FileText
                : step.id === 'summary'
                  ? ListChecks
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

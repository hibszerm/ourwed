import { Check, FileUp, Sparkles } from 'lucide-react'
import styles from './ImportWizardStepper.module.css'

export type WizardStepId = 'upload' | 'analysis' | 'done'

export const WIZARD_STEPS: Array<{
  id: WizardStepId
  label: string
  shortLabel: string
  Icon: typeof FileUp
}> = [
  { id: 'upload', label: 'Dodawanie dokumentu', shortLabel: 'Dokument', Icon: FileUp },
  { id: 'analysis', label: 'Analiza AI', shortLabel: 'Analiza', Icon: Sparkles },
  { id: 'done', label: 'Gotowe', shortLabel: 'Gotowe', Icon: Check },
]

const STEP_INDEX: Record<WizardStepId, number> = {
  upload: 0,
  analysis: 1,
  done: 2,
}

export function ImportWizardStepper({
  current,
}: {
  current: WizardStepId
}) {
  const currentIndex = STEP_INDEX[current]

  return (
    <nav className={styles.stepper} aria-label="Postęp tworzenia szablonu umowy">
      <ol className={styles.list}>
        {WIZARD_STEPS.map((step, index) => {
          const status =
            index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
          const { Icon } = step

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
                  <Icon size={14} strokeWidth={2} className={styles.icon} />
                )}
              </span>
              <span className={styles.labelFull}>{step.label}</span>
              <span className={styles.labelShort}>{step.shortLabel}</span>
              {index < WIZARD_STEPS.length - 1 ? (
                <span className={styles.connector} aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

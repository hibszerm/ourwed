import { MAPPING_WIZARD_STEPS, type MappingWizardStepId } from '../types'
import { isStepAvailable } from '../state/mappingWizardReducer'
import styles from '../MappingWizard.module.css'

export function MappingWizardStepper({
  current,
  onSelect,
}: {
  current: MappingWizardStepId
  onSelect: (step: MappingWizardStepId) => void
}) {
  return (
    <nav className={styles.stepper} aria-label="Import kontraktu">
      <ol className={styles.stepperList}>
        {MAPPING_WIZARD_STEPS.map((step, index) => {
          const available = isStepAvailable(step.id)
          const active = step.id === current
          const done =
            MAPPING_WIZARD_STEPS.findIndex((s) => s.id === current) > index

          return (
            <li key={step.id} className={styles.stepperItem}>
              {index > 0 && (
                <span className={styles.stepperConnector} aria-hidden />
              )}
              <button
                type="button"
                className={`${styles.stepperBtn} ${active ? styles.stepperBtnActive : ''} ${done ? styles.stepperBtnDone : ''} ${!available ? styles.stepperBtnLocked : ''}`}
                disabled={!available}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
              >
                <span className={styles.stepperIndex}>{index + 1}</span>
                <span className={styles.stepperLabel}>{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

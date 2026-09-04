import styles from './WeddingImportStepper.module.css'

export type WeddingImportStepId = 'upload' | 'mapping' | 'review' | 'done'

const STEPS: Array<{ id: WeddingImportStepId; label: string }> = [
  { id: 'upload', label: 'Plik' },
  { id: 'mapping', label: 'Kolumny' },
  { id: 'review', label: 'Sprawdzenie' },
  { id: 'done', label: 'Gotowe' },
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

          return (
            <li
              key={step.id}
              className={styles.item}
              data-status={status}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className={styles.index} aria-hidden>
                {index + 1}
              </span>
              <span className={styles.label}>{step.label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

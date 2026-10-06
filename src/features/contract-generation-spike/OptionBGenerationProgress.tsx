import { formatElapsed, OPTION_B_PROGRESS_STEPS, progressStageIndex, progressSupportingCopy, type OptionBProgressStage } from './generationProgress'
import styles from './OptionBGenerationProgress.module.css'

export function OptionBGenerationProgress({
  stage,
  elapsedMs,
  stageElapsedMs,
  continuationPreparing,
}: {
  stage: OptionBProgressStage
  elapsedMs: number
  stageElapsedMs: number
  continuationPreparing: boolean
}) {
  const currentIndex = progressStageIndex(stage)
  const current = OPTION_B_PROGRESS_STEPS[currentIndex]

  return (
    <section className={styles.progress} aria-busy="true" aria-label="Postęp przygotowania umowy">
      <p className={styles.eyebrow}>Przygotowanie dokumentu</p>
      <h2 className={styles.heading}>Przygotowuję umowę</h2>
      <div className={styles.currentStage}>
        <h3 className={styles.stageTitle} aria-live="polite" aria-atomic="true">{current.title}</h3>
        <p className={styles.copy}>{progressSupportingCopy(stage, stageElapsedMs, continuationPreparing)}</p>
      </div>
      <p className={styles.timer} aria-label={`Czas pracy ${formatElapsed(elapsedMs)}`}>
        <span>Czas pracy</span>
        <time>{formatElapsed(elapsedMs)}</time>
      </p>
      <ol className={styles.steps} aria-label="Etapy przygotowania umowy">
        {OPTION_B_PROGRESS_STEPS.map((item, index) => {
          const complete = index < currentIndex
          const active = index === currentIndex
          return (
            <li
              key={item.stage}
              data-active={active}
              data-complete={complete}
              aria-current={active ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true">{complete ? '✓' : index + 1}</span>
              <span className={styles.label}>{item.label}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

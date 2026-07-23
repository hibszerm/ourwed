import { useEffect, useRef, useState } from 'react'
import { Check, FileText, LoaderCircle } from 'lucide-react'
import styles from './AiAnalysisExperience.module.css'

/** Semantic analysis stages — never fake percentages. */
export const ANALYSIS_STAGES = [
  { id: 'uploaded', label: 'Dokument przesłany', kind: 'complete' as const },
  {
    id: 'structure',
    label: 'Analizowanie struktury dokumentu…',
    kind: 'active' as const,
  },
  {
    id: 'variables',
    label: 'Rozpoznawanie zmiennych…',
    kind: 'active' as const,
  },
  {
    id: 'couple',
    label: 'Wyszukiwanie danych Pary Młodej…',
    kind: 'active' as const,
  },
  {
    id: 'studio',
    label: 'Rozpoznawanie danych Studia…',
    kind: 'active' as const,
  },
  {
    id: 'package',
    label: 'Analiza danych Pakietu…',
    kind: 'active' as const,
  },
  {
    id: 'config',
    label: 'Przygotowywanie konfiguracji…',
    kind: 'active' as const,
  },
  { id: 'ready', label: 'Gotowe', kind: 'complete' as const },
] as const

const STAGE_MS_NORMAL = 900
const STAGE_MS_FAST = 420
const READY_HOLD_MS = 520

function stageDuration(pipelineDone: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 80
  return pipelineDone ? STAGE_MS_FAST : STAGE_MS_NORMAL
}

/**
 * Premium semantic progress for AI analysis.
 * Purely presentational — does not call the analyzer.
 */
export function AiAnalysisExperience({
  fileName,
  pipelineDone,
  onReveal,
}: {
  fileName: string | null
  /** True when the real AI pipeline finished successfully. */
  pipelineDone: boolean
  onReveal: () => void
}) {
  const [stageIndex, setStageIndex] = useState(0)
  const revealed = useRef(false)
  const onRevealRef = useRef(onReveal)
  onRevealRef.current = onReveal

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lastWorkingIndex = ANALYSIS_STAGES.length - 2 // "Przygotowywanie…"
    const readyIndex = ANALYSIS_STAGES.length - 1

    // Hold on last working stage until the real pipeline finishes.
    if (!pipelineDone && stageIndex >= lastWorkingIndex) {
      return
    }

    if (stageIndex >= readyIndex) {
      if (revealed.current) return
      const hold = window.setTimeout(
        () => {
          if (revealed.current) return
          revealed.current = true
          onRevealRef.current()
        },
        reducedMotion ? 40 : READY_HOLD_MS,
      )
      return () => window.clearTimeout(hold)
    }

    const ms = stageDuration(pipelineDone, reducedMotion)
    const timer = window.setTimeout(() => {
      setStageIndex((i) => Math.min(i + 1, readyIndex))
    }, ms)

    return () => window.clearTimeout(timer)
  }, [stageIndex, pipelineDone])

  const progress = (stageIndex + 1) / ANALYSIS_STAGES.length
  const current = ANALYSIS_STAGES[stageIndex]

  return (
    <div className={styles.root} aria-live="polite" aria-busy={!pipelineDone}>
      <div className={styles.panel}>
        <div className={styles.iconWrap} key={current.id}>
          {current.id === 'ready' ? (
            <Check size={22} strokeWidth={2} className={styles.iconDone} />
          ) : current.id === 'uploaded' ? (
            <FileText size={22} strokeWidth={1.75} className={styles.iconIdle} />
          ) : (
            <LoaderCircle
              size={22}
              strokeWidth={1.75}
              className={styles.iconSpin}
            />
          )}
        </div>

        <h1 className={styles.title}>Analizujemy umowę</h1>
        <p className={styles.subtitle}>
          {fileName
            ? `OurWed czyta „${fileName}” i przygotowuje konfigurację.`
            : 'OurWed czyta dokument i przygotowuje konfigurację.'}
        </p>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ANALYSIS_STAGES.length}
          aria-valuenow={stageIndex + 1}
          aria-valuetext={current.label}
        >
          <div
            className={styles.progressFill}
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>

        <ul className={styles.stages}>
          {ANALYSIS_STAGES.map((stage, index) => {
            const state =
              index < stageIndex
                ? 'done'
                : index === stageIndex
                  ? 'current'
                  : 'upcoming'
            return (
              <li
                key={stage.id}
                className={styles.stage}
                data-state={state}
              >
                <span className={styles.stageMark} aria-hidden>
                  {state === 'done' ||
                  (stage.id === 'ready' && state === 'current') ? (
                    <Check size={12} strokeWidth={2.5} />
                  ) : state === 'current' ? (
                    <span className={styles.stageDot} />
                  ) : (
                    <span className={styles.stageEmpty} />
                  )}
                </span>
                <span className={styles.stageLabel}>
                  {state === 'current' && stage.kind === 'active'
                    ? stage.label
                    : stage.label.replace(/…$/, '')}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

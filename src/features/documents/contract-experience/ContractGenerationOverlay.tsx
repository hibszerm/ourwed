import { useEffect, useState } from 'react'
import { CheckCircle2, FileText, Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AnimatedChecklist,
  stagesToChecklist,
} from './AnimatedChecklist'
import { LONG_RUNNING_HINT_MS } from './generationProgressState'
import { fadeSlide, reducedMotionSafe, scaleIn, softSpring } from './motion'
import { useSequentialStages } from './useSequentialStages'
import styles from './ContractExperience.module.css'

export const GENERATION_STAGES = [
  { id: 'prepare', label: 'Przygotowujemy umowę pakietu' },
  { id: 'template', label: 'Ładujemy szablon pakietu' },
  { id: 'details', label: 'Uzupełniamy dane ślubu' },
  { id: 'create', label: 'Tworzymy gotowy dokument' },
  { id: 'verify', label: 'Sprawdzamy poprawność dokumentu' },
  { id: 'done', label: 'Dokument jest gotowy' },
] as const

export { LONG_RUNNING_HINT_MS } from './generationProgressState'

export function ContractGenerationOverlay({
  open,
  pipelineDone,
  onStagesComplete,
}: {
  open: boolean
  pipelineDone: boolean
  onStagesComplete?: () => void
}) {
  const prefersReduced = useReducedMotion() ?? false
  const { index, isComplete } = useSequentialStages({
    stages: GENERATION_STAGES,
    active: open,
    pipelineDone,
    stageMs: 700,
    fastMs: 260,
    readyHoldMs: 320,
    onComplete: onStagesComplete,
  })

  const items = stagesToChecklist(GENERATION_STAGES, index, pipelineDone)
  const overlayVariants = reducedMotionSafe(prefersReduced, fadeSlide)
  const cardVariants = reducedMotionSafe(prefersReduced, scaleIn)
  const finished =
    pipelineDone && index >= GENERATION_STAGES.length - 1
  const iconLive = open && !finished && !prefersReduced
  const current = items.find((item) => item.state === 'current')

  const [showLongRunningHint, setShowLongRunningHint] = useState(false)

  useEffect(() => {
    if (!open || finished) {
      setShowLongRunningHint(false)
      return
    }
    setShowLongRunningHint(false)
    const timer = window.setTimeout(() => {
      setShowLongRunningHint(true)
    }, LONG_RUNNING_HINT_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [open, finished, index])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={`${styles.experience} ${styles.overlay}`}
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Generujemy umowę"
          aria-busy={!isComplete}
        >
          <motion.div
            className={styles.overlayCard}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={softSpring}
          >
            <span
              className={`${styles.overlayIcon} ${
                iconLive ? styles.overlayIconLive : ''
              }`}
              aria-hidden
            >
              <AnimatePresence mode="wait" initial={false}>
                {finished ? (
                  <motion.span
                    key="done"
                    initial={
                      prefersReduced
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 0.7 }
                    }
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={softSpring}
                    style={{ display: 'grid', placeItems: 'center' }}
                  >
                    <CheckCircle2 size={22} strokeWidth={1.75} />
                  </motion.span>
                ) : (
                  <motion.span
                    key={index === 0 ? 'file' : 'spark'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ display: 'grid', placeItems: 'center' }}
                  >
                    {index === 0 ? (
                      <FileText size={22} strokeWidth={1.75} />
                    ) : (
                      <Sparkles size={22} strokeWidth={1.75} />
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <p className={styles.eyebrow}>Generowanie</p>
            <h2 className={styles.title} style={{ fontSize: '1.45rem' }}>
              Tworzymy gotową umowę
            </h2>
            <p className={styles.subtitle}>
              Uzupełniamy dane i przygotowujemy dokument do podglądu.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <AnimatedChecklist
                items={items}
                announce={
                  current
                    ? `Trwa ${current.label}`
                    : 'Generujemy umowę…'
                }
              />
            </div>
            {showLongRunningHint && !finished ? (
              <p
                className={styles.longRunningHint}
                data-testid="generation-long-running-hint"
              >
                Generowanie dokumentu może potrwać kilkadziesiąt sekund. Dokument
                nadal jest przetwarzany — nie zamykaj tej strony.
              </p>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

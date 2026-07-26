import { Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { checklistItem, reducedMotionSafe, softSpring } from './motion'
import styles from './ContractExperience.module.css'

export type ChecklistItemState = 'upcoming' | 'current' | 'done'

export type AnimatedChecklistItem = {
  id: string
  label: string
  state: ChecklistItemState
}

/** Active mark — CSS breath / ring; morphs to check. */
function StageMark({ state }: { state: ChecklistItemState }) {
  const prefersReduced = useReducedMotion() ?? false

  return (
    <span
      className={`${styles.stageMark} ${
        state === 'current' ? styles.stageMarkLive : ''
      }`}
      data-state={state}
      aria-hidden
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <motion.span
            key="check"
            className={styles.stageMarkInner}
            initial={
              prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={
              prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.7 }
            }
            transition={softSpring}
          >
            <Check size={13} strokeWidth={2.6} />
          </motion.span>
        ) : state === 'current' ? (
          <motion.span
            key="live"
            className={styles.stageMarkInner}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <span className={styles.stageLiveDot} />
            <span className={styles.stageLiveRing} />
          </motion.span>
        ) : (
          <motion.span
            key="empty"
            className={styles.stageMarkInner}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </span>
  )
}

export function AnimatedChecklist({
  items,
  className,
  announce,
}: {
  items: AnimatedChecklistItem[]
  className?: string
  /** Screen-reader status while work is in progress. */
  announce?: string
}) {
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, checklistItem)
  const current = items.find((item) => item.state === 'current')

  return (
    <ul
      className={`${styles.stageList} ${className ?? ''}`}
      aria-live="polite"
      aria-busy={Boolean(current)}
    >
      {announce ? <li className={styles.srOnly}>{announce}</li> : null}
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.li
            key={item.id}
            className={styles.stageRow}
            data-state={item.state}
            custom={index}
            variants={variants}
            initial="initial"
            animate="animate"
            layout={!prefersReduced}
            transition={softSpring}
          >
            <StageMark state={item.state} />
            <span className={styles.stageLabel}>
              {item.label}
              {item.state === 'current' && !prefersReduced ? (
                <span className={styles.stageShimmer} aria-hidden />
              ) : null}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

export function stagesToChecklist(
  stages: readonly { id: string; label: string }[],
  index: number,
  pipelineDone: boolean,
): AnimatedChecklistItem[] {
  const last = stages.length - 1
  return stages.map((stage, i) => {
    if (i < index) return { ...stage, state: 'done' as const }
    if (i === index) {
      if (i === last && pipelineDone) {
        return { ...stage, state: 'done' as const }
      }
      return { ...stage, state: 'current' as const }
    }
    return { ...stage, state: 'upcoming' as const }
  })
}

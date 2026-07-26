import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { fadeSlide, reducedMotionSafe } from './motion'

/** Shared enter/exit wrapper for contract experience surfaces. */
export function LoadingTransition({
  show,
  children,
  className,
}: {
  show: boolean
  children: ReactNode
  className?: string
}) {
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)

  return (
    <AnimatePresence mode="wait">
      {show ? (
        <motion.div
          key="content"
          className={className}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

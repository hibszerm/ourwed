import type { Transition, Variants } from 'framer-motion'

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.8,
}

export const gentleSpring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
  mass: 0.9,
}

export const fadeSlide: Variants = {
  initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: softSpring,
  },
  exit: {
    opacity: 0,
    y: -6,
    filter: 'blur(4px)',
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: softSpring,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.16 },
  },
}

export const checklistItem: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { ...softSpring, delay: i * 0.06 },
  }),
}

export function reducedMotionSafe(
  prefersReduced: boolean,
  motion: Variants,
): Variants {
  if (!prefersReduced) return motion
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  }
}

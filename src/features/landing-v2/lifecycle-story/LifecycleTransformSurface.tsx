import { useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { LifecycleLinkObject } from '@/features/landing-v2/lifecycle-story/LifecycleLinkObject'
import {
  LIFECYCLE_RANGES,
  easeOutCubic,
  rangeT,
  workspaceInteractiveAt,
} from '@/features/landing-v2/lifecycle-story/lifecycleStoryProgress'
import { WorkflowExplorer } from '@/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer'
import styles from './LifecycleTransformSurface.module.css'

type Props = {
  /** Master lifecycle progress 0→1. */
  progress: MotionValue<number>
}

/**
 * ONE continuous centered surface:
 * link capsule → interactive workflow workspace shell.
 */
export function LifecycleTransformSurface({ progress }: Props) {
  const r = LIFECYCLE_RANGES
  const [interactive, setInteractive] = useState(() =>
    workspaceInteractiveAt(progress.get()),
  )

  useMotionValueEvent(progress, 'change', (p) => {
    const next = workspaceInteractiveAt(p)
    setInteractive((prev) => (prev === next ? prev : next))
  })

  const expand = useTransform(progress, (p) =>
    easeOutCubic(rangeT(p, r.workspaceExpand.start, r.workspaceExpand.end)),
  )
  /** Nav opacity from shared reveal curve (perceptible ≈ interactive). */
  const navIn = useTransform(progress, (p) =>
    easeOutCubic(rangeT(p, r.workspaceNavIn.start, r.workspaceNavIn.end)),
  )
  /** Subtle scale settle continues through full chrome band (→ 1.0). */
  const chromeIn = useTransform(progress, (p) =>
    easeOutCubic(rangeT(p, r.workspaceChromeIn.start, r.workspaceChromeIn.end)),
  )

  const surfaceIn = useTransform(progress, (p) =>
    easeOutCubic(rangeT(p, r.linkIn.start, r.linkIn.end)),
  )
  const surfaceOpacity = useTransform(surfaceIn, (t) => t)
  const surfaceY = useTransform(surfaceIn, (t) => (1 - t) * 14)

  const surfaceWidth = useTransform(expand, (e) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    const linkW = Math.min(600, Math.max(480, vw * 0.42))
    const workW = Math.min(1180, vw * 0.86)
    return linkW + (workW - linkW) * e
  })
  const surfaceHeight = useTransform(expand, (e) => {
    const linkH = 112
    const workH = 620
    return linkH + (workH - linkH) * e
  })
  const surfaceRadius = useTransform(expand, (e) => {
    const linkR = 999
    const workR = 28
    return linkR + (workR - linkR) * Math.min(1, e * 1.25)
  })

  const linkOpacity = useTransform(progress, (p) => {
    const inn = easeOutCubic(rangeT(p, r.linkIn.start, r.linkIn.end))
    const out = easeOutCubic(rangeT(p, r.sourceExit.start, r.sourceExit.end))
    return inn * (1 - out)
  })

  /* Opacity owned by nav reveal; scale owned by full chrome settle — composed, not competing. */
  const workspaceOpacity = useTransform(navIn, (t) => t)
  const workspaceScale = useTransform(chromeIn, (t) => 0.988 + t * 0.012)

  return (
    <motion.div
      className={styles.shell}
      data-lifecycle-surface=""
      data-lifecycle-workspace-shell=""
      style={{
        opacity: surfaceOpacity,
        y: surfaceY,
        width: surfaceWidth,
        height: surfaceHeight,
        borderRadius: surfaceRadius,
      }}
    >
      <motion.div
        className={styles.layerLink}
        data-lifecycle-surface-link=""
        style={{ opacity: linkOpacity }}
      >
        <LifecycleLinkObject progress={progress} />
      </motion.div>

      <motion.div
        className={styles.layerWorkspace}
        data-lifecycle-surface-workspace=""
        style={{
          opacity: workspaceOpacity,
          scale: workspaceScale,
        }}
      >
        <WorkflowExplorer interactive={interactive} />
      </motion.div>
    </motion.div>
  )
}

import { useMotionValueEvent, useTransform, useMotionValue, type MotionValue } from 'framer-motion'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
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
  /** Portrait shell sizes — same morph, compact width/height targets. */
  compact?: boolean
}

function compactWorkSize() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844
  const navH = 68
  const usable = Math.max(1, vh - navH)
  return {
    linkW: Math.min(vw - 28, 340),
    linkH: 96,
    workW: Math.min(vw - 22, 430),
    workH: Math.min(750, Math.max(620, Math.round(usable * 0.86))),
  }
}

/**
 * ONE continuous centered surface:
 * link capsule → interactive workflow workspace shell.
 *
 * Compact: keep final box size fixed and morph via scaleX/scaleY
 * (avoids per-frame width/height layout thrash on iOS).
 * Desktop: unchanged width/height interpolation.
 */
export function LifecycleTransformSurface({
  progress,
  compact = false,
}: Props) {
  const r = LIFECYCLE_RANGES
  const [interactive, setInteractive] = useState(() =>
    workspaceInteractiveAt(progress.get()),
  )
  /* Recompute compact shell geometry on orientation / viewport changes. */
  const viewportTick = useMotionValue(0)
  useEffect(() => {
    if (!compact) return
    const bump = () => viewportTick.set(performance.now())
    bump()
    window.addEventListener('resize', bump)
    return () => window.removeEventListener('resize', bump)
  }, [compact, viewportTick])

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
  const surfaceY = useTransform(surfaceIn, (t) => (1 - t) * (compact ? 10 : 14))

  const surfaceWidth = useTransform([expand, viewportTick], ([e]) => {
    const t = Number(e)
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    if (compact) {
      return compactWorkSize().workW
    }
    const linkW = Math.min(600, Math.max(480, vw * 0.42))
    const workW = Math.min(1180, vw * 0.86)
    return linkW + (workW - linkW) * t
  })
  const surfaceHeight = useTransform([expand, viewportTick], ([e]) => {
    const t = Number(e)
    if (compact) {
      return compactWorkSize().workH
    }
    const linkH = 112
    const workH = 620
    return linkH + (workH - linkH) * t
  })
  const surfaceScaleX = useTransform([expand, viewportTick], ([e]) => {
    if (!compact) return 1
    const t = Number(e)
    const { linkW, workW } = compactWorkSize()
    return (linkW + (workW - linkW) * t) / workW
  })
  const surfaceScaleY = useTransform([expand, viewportTick], ([e]) => {
    if (!compact) return 1
    const t = Number(e)
    const { linkH, workH } = compactWorkSize()
    return (linkH + (workH - linkH) * t) / workH
  })
  const surfaceRadius = useTransform(expand, (e) => {
    const linkR = 999
    const workR = compact ? 22 : 28
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
      data-lifecycle-surface-compact={compact ? 'true' : 'false'}
      style={{
        opacity: surfaceOpacity,
        y: surfaceY,
        width: surfaceWidth,
        height: surfaceHeight,
        scaleX: compact ? surfaceScaleX : undefined,
        scaleY: compact ? surfaceScaleY : undefined,
        borderRadius: surfaceRadius,
        transformOrigin: 'center center',
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
        <WorkflowExplorer interactive={interactive} compact={compact} />
      </motion.div>
    </motion.div>
  )
}

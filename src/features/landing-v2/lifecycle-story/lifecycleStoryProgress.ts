/**
 * Landing V2 Lifecycle Story — progress ranges (0→1 master track).
 *
 * Scroll-driven ONLY through:
 * Product iPad exit → headline → link pill → pill expands into workspace shell.
 * After settle, interactive tabs are click-driven (not scroll).
 */

/** @deprecated Kept as 1 — master progress is the sole chapter clock. */
export const LIFECYCLE_C1_END = 1

/** Identity remap — historical API used by Product iPad exit callers. */
export function chapter1Progress(master: number): number {
  return Math.min(1, Math.max(0, master))
}

/**
 * Master ranges — headline → pill → workspace morph.
 * Physical expansion stays linear/eased via helpers; no C2 contract scroll.
 */
export const LIFECYCLE_RANGES = {
  ipadExit: { start: 0.0, end: 0.12 },
  headlineIn: { start: 0.06, end: 0.18 },
  headlineHold: { start: 0.18, end: 0.28 },
  headlineOut: { start: 0.28, end: 0.4 },
  linkIn: { start: 0.32, end: 0.44 },
  linkHold: { start: 0.44, end: 0.5 },
  /** Physical shell expansion (pill → workspace). */
  workspaceExpand: { start: 0.48, end: 0.86 },
  /** Pill content fades as shell nears final size. */
  sourceExit: { start: 0.68, end: 0.8 },
  /** Workspace chrome + first panel resolve (visual settle through 1.0). */
  workspaceChromeIn: { start: 0.76, end: 1.0 },
  /**
   * Navigation opacity reveal — same curve drives visibility AND clickability.
   * Continues resolving while shell/chrome may still settle through 1.0.
   */
  workspaceNavIn: { start: 0.76, end: 0.86 },
  /**
   * Aliases kept for LinkObject / morph helpers that previously named
   * form/booking bands — mapped onto the workspace morph.
   */
  formExpand: { start: 0.48, end: 0.86 },
  formStructure: { start: 0.52, end: 0.6 },
  destinationArrive: { start: 0.56, end: 0.7 },
  urlExit: { start: 0.68, end: 0.8 },
  eyebrowExit: { start: 0.68, end: 0.78 },
  formFill: { start: 0.9, end: 1.0 },
  bookingAssemble: { start: 0.76, end: 1.0 },
  bookingHold: { start: 0.94, end: 1.0 },
  supportIn: { start: 0.9, end: 1.0 },
} as const

/**
 * Soft handoff band removed — workspace settles then normal document flow.
 * Empty stub retained so stale imports fail loudly if reintroduced incorrectly.
 * @deprecated Chapter-2 contract scroll was removed.
 */
export const LIFECYCLE_C2 = {
  sceneExit: { start: 1.0, end: 1.0 },
  sceneExitFade: { start: 1.0, end: 1.0 },
} as const

export function rangeT(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

/** Product iPad exit — master progress. */
export function ipadExitFromProgress(master: number): number {
  return easeInOutCubic(
    rangeT(master, LIFECYCLE_RANGES.ipadExit.start, LIFECYCLE_RANGES.ipadExit.end),
  )
}

/**
 * Eased nav opacity treated as “perceptibly present as a control”.
 * Below this, tabs are effectively invisible and must not capture clicks.
 * Above this, first-visible ≈ first-clickable (same UX milestone as nav reveal).
 */
export const WORKSPACE_NAV_PERCEPTIBLE_OPACITY = 0.26

/** Eased navigation opacity from the shared workspaceNavIn reveal curve. */
export function workspaceNavOpacityAt(p: number): number {
  return easeOutCubic(
    rangeT(
      p,
      LIFECYCLE_RANGES.workspaceNavIn.start,
      LIFECYCLE_RANGES.workspaceNavIn.end,
    ),
  )
}

/**
 * Master progress where nav first becomes perceptibly visible.
 * Derived from workspaceNavIn + WORKSPACE_NAV_PERCEPTIBLE_OPACITY — not an
 * independent lifecycle phase (and not shell completion / 0.86 settle).
 */
export const WORKSPACE_INTERACTION_READY_AT = (() => {
  const start = LIFECYCLE_RANGES.workspaceNavIn.start
  const end = LIFECYCLE_RANGES.workspaceNavIn.end
  const y = WORKSPACE_NAV_PERCEPTIBLE_OPACITY
  /* Invert easeOutCubic: y = 1-(1-t)^3 */
  const t = 1 - (1 - y) ** (1 / 3)
  return start + t * (end - start)
})()

/** True when workflow tabs may accept pointer + keyboard interaction. */
export function workspaceInteractiveAt(p: number): boolean {
  return workspaceNavOpacityAt(p) >= WORKSPACE_NAV_PERCEPTIBLE_OPACITY
}

/** Full visual settle of workspace chrome (not required for clicks). */
export function workspaceVisuallySettledAt(p: number): boolean {
  return rangeT(p, LIFECYCLE_RANGES.workspaceChromeIn.start, LIFECYCLE_RANGES.workspaceChromeIn.end) >= 0.999
}

/** @deprecated Soft Features handoff removed; always fully opaque in-track. */
export function sceneExitOpacityAt(p: number): number {
  void p
  return 1
}

export function staggeredFill(t: number, index: number, count: number): number {
  const n = Math.max(1, count)
  const start = index / n
  const end = (index + 1) / n
  return easeOutCubic(rangeT(t, start, end))
}

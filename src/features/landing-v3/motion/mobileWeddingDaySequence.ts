/**
 * Mobile Wedding Day demo — one-shot assignment → nav → brief.
 * Final brief state persists. No loop. No return flash to assignment.
 */

import { getMobileNavigationLeg } from '@/features/landing-v3/data/mobileWeddingDayDemo'

export type MobileDemoPhase =
  | 'settle'
  | 'navigateFocus'
  | 'chooser'
  | 'mapsFocus'
  | 'navReveal'
  | 'routeDraw'
  | 'routeHold'
  | 'navOpen'
  | 'assignReturn'
  | 'assignHold'
  | 'briefFocus'
  | 'briefReveal'
  | 'done'

export type MobileDemoFocus = 'none' | 'navigate' | 'googleMaps' | 'brief'

export type MobileDemoSnapshot = {
  phase: MobileDemoPhase
  focus: MobileDemoFocus
  phonesEntered: boolean
  /** 0 = closed, 1 = fully open */
  chooserProgress: number
  /** 0 = hidden, 1 = fully shown */
  navigationProgress: number
  /** 0–1 route path draw */
  routeProgress: number
  navStatus: 'opening' | 'opened'
  assignmentDimmed: boolean
  /** 0 = assignment front, 1 = brief fully shown */
  briefProgress: number
  progress: number
}

/**
 * Full timeline (approx):
 * 0–1.5 settle · 1.5–1.85 navigate focus · 1.85–3.55 chooser ·
 * 3.55–4.35 nav reveal · 4.35–5.35 route · 5.35–6.8 hold ·
 * 6.8–7.3 opened · 7.3–8.0 return · 8.0–8.55 assign ·
 * 8.55–8.95 brief focus · 8.95–9.6 brief in · 9.6–12.5 brief hold.
 */
export const MOBILE_DEMO_KEYFRAMES = {
  settleEnd: 1.5,
  navigateFocusEnd: 1.85,
  chooserInEnd: 2.35,
  chooserHoldEnd: 3.55,
  mapsFocusEnd: 3.85,
  navRevealEnd: 4.35,
  routeDrawEnd: 5.35,
  routeHoldEnd: 6.8,
  statusOpenEnd: 7.3,
  assignReturnEnd: 8.0,
  assignHoldEnd: 8.55,
  briefFocusEnd: 8.95,
  briefRevealEnd: 9.6,
  doneAt: 12.5,
} as const

/** Compressed timeline for ≤768px — ~25% faster, longer pause on navigation. */
export const MOBILE_DEMO_SIMPLE_KEYFRAMES = {
  settleEnd: 0.75,
  navigateFocusEnd: 1.05,
  chooserInEnd: 1.45,
  chooserHoldEnd: 2.05,
  mapsFocusEnd: 2.25,
  navRevealEnd: 2.45,
  routeDrawEnd: 3.05,
  /** Extended hold so navigation reads clearly before brief. */
  routeHoldEnd: 4.35,
  statusOpenEnd: 4.5,
  assignReturnEnd: 4.8,
  assignHoldEnd: 4.85,
  briefFocusEnd: 5.05,
  briefRevealEnd: 5.55,
  doneAt: 5.55,
} as const

export const MOBILE_DEMO_BENEFITS = [
  { index: '01', label: 'Nawigacja do kolejnego miejsca' },
  { index: '02', label: 'Kontakt do właściwej osoby' },
  { index: '03', label: 'Plan dnia i brief w kilka sekund' },
  { index: '04', label: 'Najważniejsze informacje również poza biurem' },
] as const

/** Constrained perspective (degrees). */
export const IPHONE_PERSPECTIVE = {
  primary: { rotateZ: 0.4, rotateY: -0.8 },
  secondary: { rotateZ: -2.8, rotateY: 1.2 },
  mobilePrimary: { rotateZ: 0.2, rotateY: 0 },
  mobileSecondary: { rotateZ: -2.0, rotateY: 0 },
} as const

/** Canonical iPhone-like device ratio — visual silhouette source of truth. */
export const IPHONE_DEVICE_RATIO = {
  width: 393,
  height: 852,
  token: '393:852',
  aspectCss: '393 / 852',
} as const

/** Route map safe area inside viewBox 0 0 360 430 */
export const MOBILE_ROUTE_MAP_BOUNDS = {
  viewBox: '0 0 360 430',
  safe: { xMin: 24, xMax: 336, yMin: 28, yMax: 392 },
  start: { x: 72, y: 96 },
  end: { x: 292, y: 328 },
  strokeMax: 5.5,
} as const

/** Derived navigation copy — always from shared demo data. */
export const MOBILE_ROUTE_SUMMARY = getMobileNavigationLeg()

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t)
}

export function snapshotAtTime(
  elapsedSec: number,
  mode: 'full' | 'simple',
): MobileDemoSnapshot {
  const k =
    mode === 'simple' ? MOBILE_DEMO_SIMPLE_KEYFRAMES : MOBILE_DEMO_KEYFRAMES
  const total = k.doneAt
  const progress = clamp01(elapsedSec / total)
  const entered = elapsedSec > 0.06

  const idle: MobileDemoSnapshot = {
    phase: 'settle',
    focus: 'none',
    phonesEntered: entered,
    chooserProgress: 0,
    navigationProgress: 0,
    routeProgress: 0,
    navStatus: 'opening',
    assignmentDimmed: false,
    briefProgress: 0,
    progress,
  }

  if (elapsedSec < k.settleEnd) {
    return { ...idle, phase: 'settle', phonesEntered: entered }
  }
  if (elapsedSec < k.navigateFocusEnd) {
    return {
      ...idle,
      phase: 'navigateFocus',
      phonesEntered: true,
      focus: 'navigate',
    }
  }
  if (elapsedSec < k.chooserInEnd) {
    const t =
      (elapsedSec - k.navigateFocusEnd) /
      (k.chooserInEnd - k.navigateFocusEnd)
    return {
      ...idle,
      phase: 'chooser',
      phonesEntered: true,
      chooserProgress: lerp(0, 1, t),
      assignmentDimmed: true,
    }
  }
  if (elapsedSec < k.chooserHoldEnd) {
    return {
      ...idle,
      phase: 'chooser',
      phonesEntered: true,
      chooserProgress: 1,
      assignmentDimmed: true,
    }
  }
  if (elapsedSec < k.mapsFocusEnd) {
    return {
      ...idle,
      phase: 'mapsFocus',
      phonesEntered: true,
      chooserProgress: 1,
      assignmentDimmed: true,
      focus: 'googleMaps',
    }
  }
  if (elapsedSec < k.navRevealEnd) {
    const t =
      (elapsedSec - k.mapsFocusEnd) / (k.navRevealEnd - k.mapsFocusEnd)
    return {
      ...idle,
      phase: 'navReveal',
      phonesEntered: true,
      focus: 'googleMaps',
      chooserProgress: lerp(1, 0, t),
      navigationProgress: lerp(0, 1, t),
      assignmentDimmed: true,
      navStatus: 'opening',
    }
  }
  if (elapsedSec < k.routeDrawEnd) {
    const t =
      (elapsedSec - k.navRevealEnd) / (k.routeDrawEnd - k.navRevealEnd)
    return {
      ...idle,
      phase: 'routeDraw',
      phonesEntered: true,
      chooserProgress: 0,
      navigationProgress: 1,
      routeProgress: clamp01(t),
      assignmentDimmed: false,
      navStatus: 'opening',
    }
  }
  if (elapsedSec < k.routeHoldEnd) {
    return {
      ...idle,
      phase: 'routeHold',
      phonesEntered: true,
      navigationProgress: 1,
      routeProgress: 1,
      navStatus: 'opening',
    }
  }
  if (elapsedSec < k.statusOpenEnd) {
    return {
      ...idle,
      phase: 'navOpen',
      phonesEntered: true,
      navigationProgress: 1,
      routeProgress: 1,
      navStatus: 'opened',
    }
  }
  if (elapsedSec < k.assignReturnEnd) {
    const t =
      (elapsedSec - k.statusOpenEnd) /
      (k.assignReturnEnd - k.statusOpenEnd)
    return {
      ...idle,
      phase: 'assignReturn',
      phonesEntered: true,
      navigationProgress: lerp(1, 0, t),
      routeProgress: 1,
      navStatus: 'opened',
    }
  }
  if (elapsedSec < k.assignHoldEnd) {
    return {
      ...idle,
      phase: 'assignHold',
      phonesEntered: true,
      navigationProgress: 0,
      routeProgress: 1,
      navStatus: 'opened',
    }
  }
  if (elapsedSec < k.briefFocusEnd) {
    return {
      ...idle,
      phase: 'briefFocus',
      phonesEntered: true,
      focus: 'brief',
      navigationProgress: 0,
      routeProgress: 1,
      navStatus: 'opened',
    }
  }
  if (elapsedSec < k.briefRevealEnd) {
    const t =
      (elapsedSec - k.briefFocusEnd) /
      (k.briefRevealEnd - k.briefFocusEnd)
    return {
      ...idle,
      phase: 'briefReveal',
      phonesEntered: true,
      focus: 'brief',
      briefProgress: lerp(0, 1, t),
      navigationProgress: 0,
      routeProgress: 1,
      navStatus: 'opened',
    }
  }
  return {
    ...idle,
    phase: 'done',
    phonesEntered: true,
    focus: 'none',
    briefProgress: 1,
    navigationProgress: 0,
    routeProgress: 1,
    navStatus: 'opened',
    progress: 1,
  }
}

export function cycleDuration(mode: 'full' | 'simple'): number {
  return mode === 'simple'
    ? MOBILE_DEMO_SIMPLE_KEYFRAMES.doneAt
    : MOBILE_DEMO_KEYFRAMES.doneAt
}

/** Reduced motion: permanent mobile Brief final state. */
export const REDUCED_MOTION_SNAPSHOT: MobileDemoSnapshot = {
  phase: 'done',
  focus: 'none',
  phonesEntered: true,
  chooserProgress: 0,
  navigationProgress: 0,
  routeProgress: 1,
  navStatus: 'opened',
  assignmentDimmed: false,
  briefProgress: 1,
  progress: 1,
}

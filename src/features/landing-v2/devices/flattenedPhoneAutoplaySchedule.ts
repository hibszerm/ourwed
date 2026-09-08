import type { LandingPhoneLayerId } from '@/features/landing-v2/devices/landingDeviceAssets'

/**
 * Compact phone internal product tour — Iteration 3F.
 *
 * Time-driven (NOT scroll-scrubbed). Phone frame stays still; only screen
 * layers animate with transform/opacity. Max 2 bitmap layers.
 */

export const PHONE_DEMO_SETTLE_DELAY_MS = 400

type Phase = {
  id: string
  a: LandingPhoneLayerId
  b: LandingPhoneLayerId
  blend: number
  stripT: number
  ms: number
}

/** Discrete phase schedule — calm holds + short transitions. */
export const PHONE_DEMO_PHASES: readonly Phase[] = [
  { id: 'intro', a: 'dashStrip', b: 'dashStrip', blend: 0, stripT: 0, ms: 750 },
  { id: 'dashDrift', a: 'dashStrip', b: 'dashStrip', blend: 0, stripT: 1, ms: 1800 },
  { id: 'dashHold', a: 'dashStrip', b: 'dashStrip', blend: 0, stripT: 1, ms: 450 },
  { id: 'toDay', a: 'dashStrip', b: 'day', blend: 1, stripT: 1, ms: 550 },
  { id: 'dayHold', a: 'day', b: 'day', blend: 0, stripT: 0, ms: 1600 },
  { id: 'toNav', a: 'day', b: 'nav', blend: 1, stripT: 0, ms: 550 },
  { id: 'navHold', a: 'nav', b: 'nav', blend: 0, stripT: 0, ms: 1600 },
  { id: 'toBrief', a: 'nav', b: 'brief', blend: 1, stripT: 0, ms: 550 },
  { id: 'briefHold', a: 'brief', b: 'brief', blend: 0, stripT: 0, ms: 1800 },
]

export function phoneDemoTotalDurationMs(): number {
  return (
    PHONE_DEMO_SETTLE_DELAY_MS +
    PHONE_DEMO_PHASES.reduce((sum, p) => sum + p.ms, 0)
  )
}

export function phoneDemoActiveLayerCount(phaseIndex: number): number {
  const p = PHONE_DEMO_PHASES[phaseIndex]
  if (!p) return 1
  return p.a === p.b ? 1 : 2
}

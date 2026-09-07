import type { ProductStoryTabId } from '@/features/landing-v2/product-story/productStoryProgress'
import {
  PRODUCT_STORY_RANGES,
  rangeT,
} from '@/features/landing-v2/product-story/productStoryProgress'

/** Public URLs for compact flattened device application surfaces. */
export const LANDING_DEVICE_ASSETS = {
  heroTabletLight: '/landing-v2/devices/hero-tablet-light.webp',
  heroTabletDark: '/landing-v2/devices/hero-tablet-dark.webp',
  productTabletOverview: '/landing-v2/devices/product-tablet-overview.webp',
  productTabletLogistics: '/landing-v2/devices/product-tablet-logistics.webp',
  productTabletFinance: '/landing-v2/devices/product-tablet-finance.webp',
  productTabletQuestionnaire:
    '/landing-v2/devices/product-tablet-questionnaire.webp',
  phoneDashboardStrip: '/landing-v2/devices/phone-dashboard-strip.webp',
  phoneDashboard: '/landing-v2/devices/phone-dashboard.webp',
  phoneDashboardEnd: '/landing-v2/devices/phone-dashboard-end.webp',
  phoneDay: '/landing-v2/devices/phone-day.webp',
  phoneNav: '/landing-v2/devices/phone-nav.webp',
  phoneBrief: '/landing-v2/devices/phone-brief.webp',
} as const

export type LandingProductLayerId = ProductStoryTabId

export type ProductLayerState = {
  a: LandingProductLayerId
  b: LandingProductLayerId
  /** 0 = only A, 1 = only B during tab handoff windows. */
  blend: number
}

/**
 * Map Product Story tab scrub progress → flattened layers.
 * Uses the same PRODUCT_STORY_RANGES as live desktop.
 */
export function productLayersAt(tabProgress: number): ProductLayerState {
  const p = Math.min(1, Math.max(0, tabProgress))
  const r = PRODUCT_STORY_RANGES

  if (p < r.toLogistics.start) {
    return { a: 'overview', b: 'overview', blend: 0 }
  }
  if (p < r.toLogistics.end) {
    const t = rangeT(p, r.toLogistics.start, r.toLogistics.end)
    if (t >= 1) return { a: 'logistics', b: 'logistics', blend: 0 }
    return { a: 'overview', b: 'logistics', blend: t }
  }
  if (p < r.toFinance.start) {
    return { a: 'logistics', b: 'logistics', blend: 0 }
  }
  if (p < r.toFinance.end) {
    const t = rangeT(p, r.toFinance.start, r.toFinance.end)
    if (t >= 1) return { a: 'finance', b: 'finance', blend: 0 }
    return { a: 'logistics', b: 'finance', blend: t }
  }
  if (p < r.toQuestionnaire.start) {
    return { a: 'finance', b: 'finance', blend: 0 }
  }
  if (p < r.toQuestionnaire.end) {
    const t = rangeT(p, r.toQuestionnaire.start, r.toQuestionnaire.end)
    if (t >= 1) return { a: 'questionnaire', b: 'questionnaire', blend: 0 }
    return { a: 'finance', b: 'questionnaire', blend: t }
  }
  return { a: 'questionnaire', b: 'questionnaire', blend: 0 }
}

export function productLayerSrc(id: LandingProductLayerId): string {
  switch (id) {
    case 'overview':
      return LANDING_DEVICE_ASSETS.productTabletOverview
    case 'logistics':
      return LANDING_DEVICE_ASSETS.productTabletLogistics
    case 'finance':
      return LANDING_DEVICE_ASSETS.productTabletFinance
    case 'questionnaire':
      return LANDING_DEVICE_ASSETS.productTabletQuestionnaire
  }
}

export function productAppContentLayerCount(tabProgress: number): number {
  const { a, b } = productLayersAt(tabProgress)
  return a === b ? 1 : 2
}

/**
 * Story stages for compact phone (aligned with MOBILE_APP_RANGES).
 * Dashboard scroll uses ONE tall strip + translate3d (not dual opacity).
 */
export type LandingPhoneLayerId = 'dashStrip' | 'day' | 'nav' | 'brief'

export type PhoneLayerState = {
  a: LandingPhoneLayerId
  b: LandingPhoneLayerId
  /** 0 = only A, 1 = only B (opacity crossfade during screen handoffs). */
  blend: number
  /** Dashboard strip scroll 0→1 (translate only; ignored off-strip). */
  stripT: number
}

/** Map Mobile Story appProgress → flattened layers + scroll. */
export function phoneLayersAt(appProgress: number): PhoneLayerState {
  const p = Math.min(1, Math.max(0, appProgress))

  /* dashBreath + dashScroll + dashEndHold */
  if (p < 0.56) {
    const stripT = Math.min(1, Math.max(0, (p - 0.03) / 0.49))
    return { a: 'dashStrip', b: 'dashStrip', blend: 0, stripT }
  }

  /* handoff → day */
  if (p < 0.66) {
    const t = Math.min(1, Math.max(0, (p - 0.56) / 0.1))
    if (t >= 1) return { a: 'day', b: 'day', blend: 0, stripT: 1 }
    return { a: 'dashStrip', b: 'day', blend: t, stripT: 1 }
  }

  /* day hold + day scroll */
  if (p < 0.788) {
    return { a: 'day', b: 'day', blend: 0, stripT: 0 }
  }

  /* mapIn / nav */
  if (p < 0.932) {
    const t = Math.min(1, Math.max(0, (p - 0.788) / 0.044))
    if (t >= 1) return { a: 'nav', b: 'nav', blend: 0, stripT: 0 }
    return { a: 'day', b: 'nav', blend: t, stripT: 0 }
  }

  /* briefEnter + hold */
  const t = Math.min(1, Math.max(0, (p - 0.932) / 0.026))
  if (t >= 1) return { a: 'brief', b: 'brief', blend: 0, stripT: 0 }
  return { a: 'nav', b: 'brief', blend: t, stripT: 0 }
}

export function phoneLayerSrc(id: LandingPhoneLayerId): string {
  switch (id) {
    case 'dashStrip':
      return LANDING_DEVICE_ASSETS.phoneDashboardStrip
    case 'day':
      return LANDING_DEVICE_ASSETS.phoneDay
    case 'nav':
      return LANDING_DEVICE_ASSETS.phoneNav
    case 'brief':
      return LANDING_DEVICE_ASSETS.phoneBrief
  }
}

/** Max simultaneous application-content image layers for a progress value. */
export function phoneAppContentLayerCount(appProgress: number): number {
  const { a, b } = phoneLayersAt(appProgress)
  return a === b ? 1 : 2
}

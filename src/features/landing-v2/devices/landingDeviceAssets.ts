/** Public URLs for compact flattened device application surfaces. */
export const LANDING_DEVICE_ASSETS = {
  heroTabletLight: '/landing-v2/devices/hero-tablet-light.webp',
  heroTabletDark: '/landing-v2/devices/hero-tablet-dark.webp',
  productTabletOverview: '/landing-v2/devices/product-tablet-overview.webp',
  phoneDashboardStrip: '/landing-v2/devices/phone-dashboard-strip.webp',
  phoneDashboard: '/landing-v2/devices/phone-dashboard.webp',
  phoneDashboardEnd: '/landing-v2/devices/phone-dashboard-end.webp',
  phoneDay: '/landing-v2/devices/phone-day.webp',
  phoneNav: '/landing-v2/devices/phone-nav.webp',
  phoneBrief: '/landing-v2/devices/phone-brief.webp',
} as const

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

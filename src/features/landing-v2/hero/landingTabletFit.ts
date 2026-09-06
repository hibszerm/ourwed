/**
 * Shared canonical landscape tablet fit — Hero settle and Product settle
 * must use the same design canvas and outer uniform scale model.
 *
 * Internals stay at 1420×860; only the outer wrapper scales.
 */

export const LANDING_TABLET_DESIGN_WIDTH_PX = 1420
export const LANDING_TABLET_DESIGN_HEIGHT_PX = 860

export type CanonicalDeviceFit = {
  scale: number
  slotW: number
  slotH: number
}

/**
 * Measure uniform outer scale so a fitLock tablet fills the sticky stage
 * with padding — never reflows dashboard internals.
 */
export function measureCanonicalDeviceFit(input: {
  sticky: HTMLElement
  fit: HTMLElement
  padX?: number
  padY?: number
  /** CSS var on `.fit` that drives transform:scale (default Hero). */
  cssVar?: string
}): CanonicalDeviceFit | null {
  const {
    sticky,
    fit,
    padX = 24,
    padY = 28,
    cssVar = '--hero-device-fit-scale',
  } = input

  const device = fit.querySelector(
    '[data-testid="lv2-hero-tablet"]',
  ) as HTMLElement | null
  if (!device) return null

  /* Measure natural size at scale 1 */
  fit.style.setProperty(cssVar, '1')
  const naturalW = device.offsetWidth
  const naturalH = device.offsetHeight
  if (naturalW < 40 || naturalH < 40) return null

  const availW = Math.max(80, sticky.clientWidth - padX)
  const availH = Math.max(80, sticky.clientHeight - padY)
  const next = Math.min(1, availW / naturalW, availH / naturalH)
  const scale = Math.max(0.18, Number(next.toFixed(4)))
  fit.style.setProperty(cssVar, String(scale))

  return {
    scale,
    slotW: Math.round(naturalW * scale),
    slotH: Math.round(naturalH * scale),
  }
}

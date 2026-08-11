/**
 * Approved desktop composition metrics measured at 1440×1000 on /landing-v3.
 * Source of truth for DesktopCompositionScale — do not invent mobile sizes.
 */
export const COMPOSITION_VERSION = '3' as const

export type CompositionKey =
  | 'import'
  | 'assignment'
  | 'questionnaireContract'
  | 'finance'
  | 'weddingDay'
  | 'security'
  | 'calendar'
  | 'brief'
  | 'sessions'

export type CompositionMetrics = {
  width: number
  height: number
  /** Unscaled desktop shadow bleed allowance (px). */
  shadowPadding?: number
  compositionId: string
}

export const DESKTOP_COMPOSITION_METRICS: Record<
  CompositionKey,
  CompositionMetrics
> = {
  import: {
    width: 1360,
    height: 727,
    shadowPadding: 28,
    compositionId: 'landing-import',
  },
  assignment: {
    width: 1360,
    height: 780,
    shadowPadding: 28,
    compositionId: 'landing-assignment',
  },
  questionnaireContract: {
    width: 1360,
    height: 797,
    shadowPadding: 28,
    compositionId: 'landing-qc',
  },
  finance: {
    width: 1360,
    height: 700,
    shadowPadding: 24,
    compositionId: 'landing-finance',
  },
  weddingDay: {
    width: 1360,
    height: 700,
    shadowPadding: 24,
    compositionId: 'landing-wedding-day',
  },
  security: {
    width: 1360,
    height: 822,
    shadowPadding: 20,
    compositionId: 'landing-security',
  },
  calendar: {
    width: 1120,
    height: 711,
    shadowPadding: 24,
    compositionId: 'landing-calendar',
  },
  brief: {
    width: 1360,
    height: 779,
    shadowPadding: 28,
    compositionId: 'landing-brief',
  },
  sessions: {
    width: 1360,
    height: 332,
    shadowPadding: 24,
    compositionId: 'landing-sessions',
  },
}

/** Exact uniform scale for available product width. */
export function computeCompositionScale(
  baseWidth: number,
  availableWidth: number,
  maxScale = 1,
): number {
  if (baseWidth <= 0 || availableWidth <= 0) return 1
  return Math.min(maxScale, availableWidth / baseWidth)
}

export function computeScaledHeight(
  baseHeight: number,
  scale: number,
  shadowPadding = 0,
): number {
  return baseHeight * scale + shadowPadding * scale
}

import type { Appearance } from '@/features/appearance/types'

/** Chip / block colors — category identity, not workflow stage. */
export interface CalendarEventColors {
  background: string
  text: string
  border: string
}

/** Light appearance — frozen baseline chip treatment. */
export const LIGHT_CALENDAR_EVENT_COLORS: CalendarEventColors = {
  background: 'rgba(0, 0, 0, 0.04)',
  text: '#1a1a1a',
  border: 'rgba(0, 0, 0, 0.12)',
}

/** Dark appearance — calm monochromatic chip on elevated calendar cells. */
export const DARK_CALENDAR_EVENT_COLORS: CalendarEventColors = {
  background: 'rgba(237, 232, 224, 0.06)',
  text: '#EDE8E0',
  border: 'rgba(237, 232, 224, 0.12)',
}

/** @deprecated Use resolveCalendarEventColors — kept for data-layer tests. */
export const WEDDING_CALENDAR_COLORS = LIGHT_CALENDAR_EVENT_COLORS

/** @deprecated Use resolveCalendarEventColors — kept for data-layer tests. */
export const SESSION_CALENDAR_COLORS = LIGHT_CALENDAR_EVENT_COLORS

export function resolveCalendarEventColors(
  appearance: Appearance,
): CalendarEventColors {
  return appearance === 'dark'
    ? DARK_CALENDAR_EVENT_COLORS
    : LIGHT_CALENDAR_EVENT_COLORS
}

/** Session left-accent when no package color exists. */
export function resolveSessionPackageAccent(appearance: Appearance): string {
  return appearance === 'dark' ? '#948C84' : '#525252'
}

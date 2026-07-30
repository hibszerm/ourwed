/**
 * Application theme IDs — stable, persisted on profiles.theme_id.
 * Never invent ad-hoc IDs in product components.
 */

export const THEME_IDS = [
  'classic',
  'gentlemen',
  'sage_garden',
  'burgundy_estate',
  'mocha_editorial',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'classic'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function validateThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID
}

/** Persistence / UI save state for Settings. */
export type ThemePersistStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'

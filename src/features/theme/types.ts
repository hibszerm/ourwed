/**
 * Application theme IDs — stable, persisted on profiles.theme_id.
 * Never invent ad-hoc IDs in product components.
 */

export const THEME_IDS = [
  'classic',
  'graphite',
  'sage_garden',
  'burgundy_estate',
  'mocha_editorial',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'classic'

/** One-release remap for cached/localStorage values before/after DB migration. */
const LEGACY_THEME_ID_REMAP: Record<string, ThemeId> = {
  // former theme id "gent"+"lemen" → graphite
  ['gent' + 'lemen']: 'graphite',
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function validateThemeId(value: unknown): ThemeId {
  if (typeof value === 'string' && value in LEGACY_THEME_ID_REMAP) {
    return LEGACY_THEME_ID_REMAP[value]!
  }
  return isThemeId(value) ? value : DEFAULT_THEME_ID
}

/** Persistence / UI save state for Settings. */
export type ThemePersistStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'

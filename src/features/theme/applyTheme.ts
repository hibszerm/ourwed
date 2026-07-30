import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import {
  DEFAULT_THEME_ID,
  validateThemeId,
  type ThemeId,
} from '@/features/theme/types'

const APPLIED_KEYS_ATTR = 'data-ourwed-theme-vars'

/**
 * Apply theme CSS variables on <html> and set data-theme.
 * Safe to call before React mounts (FOUC prevention).
 */
export function applyThemeToDocument(themeId: ThemeId | string): ThemeId {
  const id = validateThemeId(themeId)
  const root = document.documentElement
  const vars = resolveThemeCssVariables(id)

  root.dataset.theme = id

  const previous = root.getAttribute(APPLIED_KEYS_ATTR)
  if (previous) {
    for (const key of previous.split(' ')) {
      if (key) root.style.removeProperty(key)
    }
  }

  const keys: string[] = []
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
    keys.push(key)
  }
  root.setAttribute(APPLIED_KEYS_ATTR, keys.join(' '))

  return id
}

export function readDocumentThemeId(): ThemeId {
  return validateThemeId(document.documentElement.dataset.theme)
}

export function resetThemeToClassic(): ThemeId {
  return applyThemeToDocument(DEFAULT_THEME_ID)
}

import { resolveBrowserThemeColor } from '@/features/appearance/browserThemeColor'
import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  type Appearance,
} from '@/features/appearance/types'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import {
  DEFAULT_THEME_ID,
  validateThemeId,
  type ThemeId,
} from '@/features/theme/types'

const META_SELECTOR = 'meta[name="theme-color"]'

const APPLIED_KEYS_ATTR = 'data-ourwed-theme-vars'

/**
 * Apply theme CSS variables on <html> and set data-theme.
 * Safe to call before React mounts (FOUC prevention).
 */
export function applyThemeToDocument(
  themeId: ThemeId | string,
  appearance: Appearance = DEFAULT_APPEARANCE,
): ThemeId {
  const id = validateThemeId(themeId)
  const mode = validateAppearance(appearance)
  const root = document.documentElement
  const vars = resolveThemeCssVariables(id, mode)

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

  const themeColor = resolveBrowserThemeColor(id, mode)
  let meta = document.querySelector<HTMLMetaElement>(META_SELECTOR)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = themeColor

  return id
}

export function readDocumentThemeId(): ThemeId {
  return validateThemeId(document.documentElement.dataset.theme)
}

export function resetThemeToClassic(): ThemeId {
  return applyThemeToDocument(DEFAULT_THEME_ID)
}

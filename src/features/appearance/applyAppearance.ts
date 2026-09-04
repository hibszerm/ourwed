import { resolveBrowserThemeColor } from '@/features/appearance/browserThemeColor'
import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  type Appearance,
} from '@/features/appearance/types'
import { validateThemeId } from '@/features/theme/types'

const META_SELECTOR = 'meta[name="theme-color"]'

/**
 * Apply appearance on <html>: data-appearance, color-scheme, browser theme-color.
 * Safe to call before React mounts (FOUC prevention).
 */
export function applyAppearanceToDocument(
  appearance: Appearance | string,
): Appearance {
  const mode = validateAppearance(appearance)
  const root = document.documentElement

  root.dataset.appearance = mode
  root.style.colorScheme = mode

  const themeId = validateThemeId(document.documentElement.dataset.theme)
  const themeColor = resolveBrowserThemeColor(themeId, mode)
  let meta = document.querySelector<HTMLMetaElement>(META_SELECTOR)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = themeColor

  return mode
}

export function readDocumentAppearance(): Appearance {
  return validateAppearance(document.documentElement.dataset.appearance)
}

export function resetAppearanceToLight(): Appearance {
  return applyAppearanceToDocument(DEFAULT_APPEARANCE)
}

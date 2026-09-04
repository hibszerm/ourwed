import type { Appearance } from '@/features/appearance/types'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import type { ThemeId } from '@/features/theme/types'

/**
 * Resolve <meta name="theme-color"> from semantic tokens — no hardcoded literals.
 */
export function resolveBrowserThemeColor(
  themeId: ThemeId,
  appearance: Appearance,
): string {
  const vars = resolveThemeCssVariables(themeId, appearance)
  return vars['--browser-chrome-color'] ?? vars['--app-background']
}

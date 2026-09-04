import type { ThemeTokenMap } from '@/features/theme/tokenKeys'
import { CLASSIC_DARK_TOKENS } from '@/features/theme/dark/darkClassic'
import { THEME_DARK_OVERRIDES } from '@/features/theme/dark/themeDarkOverrides'
import type { ThemeId } from '@/features/theme/types'

export function resolveDarkThemeTokens(themeId: ThemeId): ThemeTokenMap {
  const overrides = THEME_DARK_OVERRIDES[themeId] ?? {}
  return { ...CLASSIC_DARK_TOKENS, ...overrides }
}

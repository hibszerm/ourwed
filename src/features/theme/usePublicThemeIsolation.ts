import { useEffect } from 'react'
import { applyAppearanceToDocument } from '@/features/appearance/applyAppearance'
import { readCachedAppearance } from '@/features/appearance/appearanceCache'
import { applyThemeToDocument } from '@/features/theme/applyTheme'
import { readCachedThemeId } from '@/features/theme/themeCache'
import { DEFAULT_THEME_ID } from '@/features/theme/types'

/**
 * Isolate public/client-facing pages from the private panel theme.
 * Forces Classic tokens while mounted; restores the cached private theme on leave.
 */
export function usePublicThemeIsolation(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    root.dataset.themeSurface = 'public'
    applyAppearanceToDocument('light')
    applyThemeToDocument(DEFAULT_THEME_ID, 'light')
    return () => {
      delete root.dataset.themeSurface
      const appearance = readCachedAppearance(null)
      applyAppearanceToDocument(appearance)
      applyThemeToDocument(readCachedThemeId(null), appearance)
    }
  }, [enabled])
}

/** True while a public/client page owns the document theme. */
export function isPublicThemeSurfaceActive(): boolean {
  return document.documentElement.dataset.themeSurface === 'public'
}


import { useEffect } from 'react'
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
    applyThemeToDocument(DEFAULT_THEME_ID)
    return () => {
      delete root.dataset.themeSurface
      applyThemeToDocument(readCachedThemeId(null))
    }
  }, [enabled])
}

/** True while a public/client page owns the document theme. */
export function isPublicThemeSurfaceActive(): boolean {
  return document.documentElement.dataset.themeSurface === 'public'
}


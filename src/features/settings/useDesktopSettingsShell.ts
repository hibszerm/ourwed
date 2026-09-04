import { useEffect, useState } from 'react'
import { SETTINGS_DESKTOP_MEDIA_QUERY } from './settingsNav'

/**
 * True at the AppLayout desktop breakpoint (>=768px).
 * Kept for callers that still need a viewport split; Settings chrome is
 * no longer gated on this hook.
 */
export function useDesktopSettingsShell(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(SETTINGS_DESKTOP_MEDIA_QUERY).matches
  })

  useEffect(() => {
    const media = window.matchMedia(SETTINGS_DESKTOP_MEDIA_QUERY)
    const sync = () => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isDesktop
}

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type LandingVersion = 'v1' | 'v2'

const STORAGE_KEY = 'ourwed:landing-version'

/**
 * Developer switch for Landing V1 / V2.
 * Priority: ?landing=v2|v1 → VITE_LANDING_VERSION → localStorage → v1
 */
export function useLandingVersion(): LandingVersion {
  const [params] = useSearchParams()

  return useMemo(() => {
    const fromQuery = params.get('landing')?.toLowerCase()
    if (fromQuery === 'v2' || fromQuery === 'v1') return fromQuery

    const fromEnv = import.meta.env.VITE_LANDING_VERSION?.toLowerCase()
    if (fromEnv === 'v2' || fromEnv === 'v1') return fromEnv

    try {
      const stored = localStorage.getItem(STORAGE_KEY)?.toLowerCase()
      if (stored === 'v2' || stored === 'v1') return stored
    } catch {
      /* ignore */
    }

    return 'v1'
  }, [params])
}

export function setLandingVersionPreference(version: LandingVersion) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    /* ignore */
  }
}

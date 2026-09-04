import { Navigate, useLocation } from 'react-router-dom'

/**
 * Declarative redirect to `/` that keeps an existing URL fragment
 * (e.g. `/landingv2#cennik` → `/#cennik`).
 */
export function RedirectToRootPreserveHash() {
  const { hash, search } = useLocation()
  return <Navigate to={{ pathname: '/', search, hash }} replace />
}

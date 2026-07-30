import { Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  buildAuthCallbackRedirect,
  locationNeedsAuthCallback,
} from '@/features/auth/callback/authCallback'

/**
 * Pathless layout: any ?code= / ?error= outside /auth/callback
 * is forwarded there before child routes (e.g. homepage) can paint.
 */
export function AuthCallbackGate() {
  const location = useLocation()

  if (locationNeedsAuthCallback(location.pathname, location.search)) {
    return (
      <Navigate
        to={buildAuthCallbackRedirect(location.search, location.hash)}
        replace
      />
    )
  }

  return <Outlet />
}

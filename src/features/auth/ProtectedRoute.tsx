import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { captureProtectedFrom } from '@/features/auth/postLoginRedirect'
import { ProAccessGateProvider } from '@/features/billing/ProAccessGate'
import { shouldRedirectLogoutToLanding } from '@/lib/auth/logoutRedirect'

/**
 * Guards studio routes.
 * Unauthenticated users go to /login (deep links), except right after logout → `/`.
 * Public Form Engine (`/form/:token`) stays outside this layout.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AuthLoadingScreen />
  }

  if (!isAuthenticated) {
    if (shouldRedirectLogoutToLanding()) {
      return <Navigate to="/" replace />
    }
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: captureProtectedFrom(location.pathname, location.search) }}
      />
    )
  }

  return (
    <ProAccessGateProvider>
      <Outlet />
    </ProAccessGateProvider>
  )
}

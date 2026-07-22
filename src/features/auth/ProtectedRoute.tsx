import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'

/**
 * Guards studio routes. Unauthenticated users are sent to /login.
 * Public Form Engine (`/form/:token`) stays outside this layout.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AuthLoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

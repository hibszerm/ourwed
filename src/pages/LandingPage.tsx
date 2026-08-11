import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import { LandingV3Page } from '@/features/landing-v3/LandingV3Page'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'

/**
 * Production landing — Landing V3.
 * Authenticated visitors go to the dashboard.
 */
export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    clearLogoutRedirectToLanding()
  }, [])

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <LandingV3Page />
}

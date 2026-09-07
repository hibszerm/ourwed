import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import { LandingV2Page } from '@/features/landing-v2/LandingV2Page'
import { AccountDeletedNotice } from '@/features/account-deletion/AccountDeletedNotice'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'

/**
 * Production public landing — accepted Landing V2.
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

  return (
    <>
      <AccountDeletedNotice />
      <LandingV2Page />
    </>
  )
}

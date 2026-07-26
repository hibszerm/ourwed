import { useEffect, useId, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import { LandingV2 } from '@/features/landing-v2/LandingV2'
import { useLandingVersion } from '@/features/landing-v2/useLandingVersion'
import {
  LandingAuthDialog,
  type AuthDialogView,
} from '@/features/landing/LandingAuthDialog'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import { LandingPageV1 } from '@/pages/LandingPageV1'

/**
 * Landing entry — preserves V1, routes to cinematic V2 via switch.
 * Switch: ?landing=v2 | VITE_LANDING_VERSION=v2 | localStorage ourwed:landing-version
 */
export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const version = useLandingVersion()
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<AuthDialogView>('login')
  const [authEmail, setAuthEmail] = useState('')
  const dialogKey = useId()

  useEffect(() => {
    clearLogoutRedirectToLanding()
  }, [])

  function openAuth(view: AuthDialogView) {
    setAuthView(view)
    setAuthEmail('')
    setAuthOpen(true)
  }

  function changeAuthView(view: AuthDialogView, email?: string) {
    setAuthView(view)
    if (email) setAuthEmail(email)
  }

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  if (version === 'v2') {
    return (
      <>
        <LandingV2
          onLogin={() => openAuth('login')}
          onRegister={() => openAuth('register')}
        />
        <LandingAuthDialog
          key={dialogKey}
          open={authOpen}
          view={authView}
          emailHint={authEmail}
          onClose={() => setAuthOpen(false)}
          onChangeView={changeAuthView}
        />
      </>
    )
  }

  return <LandingPageV1 />
}

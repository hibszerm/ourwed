import { Navigate, useLocation } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { CheckEmailPanel } from '@/features/auth/components/CheckEmailPanel'
import { useAuth } from '@/features/auth/AuthProvider'

export function CheckEmailPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell title="Prawie gotowe">
      <CheckEmailPanel email={email} />
    </AuthShell>
  )
}

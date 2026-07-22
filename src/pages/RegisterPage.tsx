import { Link, Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useAuth } from '@/features/auth/AuthProvider'

export function RegisterPage() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      wide
      title="Utwórz konto"
      subtitle="Załóż konto studia i prowadź całą firmę ślubną w jednym miejscu."
      footer={
        <>
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  )
}

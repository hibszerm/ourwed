import { Navigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useAuth } from '@/features/auth/AuthProvider'
import shellStyles from '@/features/auth/components/AuthShell.module.css'
import { AuthLegalRegisterCopy } from '@/features/legal/LegalLinks'

export function RegisterPage() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      layout="split"
      variant="register"
      wide
      eyebrow="DOŁĄCZ DO OURWED"
      title={<span className={shellStyles.titleLine}>Stwórz swoje studio.</span>}
      subtitle="Zacznij prowadzić zlecenia w jednym miejscu."
      switchPrompt="Masz już konto?"
      switchLabel="Zaloguj się"
      switchTo="/login"
      legal={<AuthLegalRegisterCopy />}
    >      <RegisterForm />
    </AuthShell>
  )
}
